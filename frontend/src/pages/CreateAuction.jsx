import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser } from '../utils/auth.js';

const PROCESS_CAMERA_URL = 'http://localhost/process-camera-details';
const AUCTION_API_URL    = 'http://localhost/auction/create';

function defaultEndDate() {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateAuction() {
  const navigate = useNavigate();
  const storedUser = getUser();
  const isLoggedIn = storedUser && storedUser.user_id;

  // Step state: 1 = camera details, 2 = auction details (post-analysis)
  const [step, setStep] = useState(1); // 1 or 2
  const [loading, setLoading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');

  // Step 1 fields
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [shutterCount, setShutterCount] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Analysis result
  const [analysisResult, setAnalysisResult] = useState(null);

  // Step 2 fields
  const [startPrice, setStartPrice] = useState('');
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [listingTitle, setListingTitle] = useState('');

  // Result states
  const [successAuctionId, setSuccessAuctionId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Sidebar summary
  const [sidebarSummary, setSidebarSummary] = useState(null);

  const uploadZoneRef = useRef(null);

  function handleFileChange(file) {
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleAnalyse() {
    if (!brand || !model || !shutterCount || !imageFile) {
      alert('Please fill in brand, model, shutter count and upload an image.');
      return;
    }
    setLoading(true);
    setProgressLabel('Uploading image and analysing with AI…');

    const formData = new FormData();
    formData.append('brand', brand);
    formData.append('model', model);
    formData.append('shutter_count', shutterCount);
    formData.append('seller_id', storedUser.user_id);
    formData.append('image', imageFile);

    try {
      const res = await fetch(PROCESS_CAMERA_URL, { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || data.code !== 200) {
        throw new Error(data.message || 'Analysis failed.');
      }

      const result = data.data;
      setAnalysisResult(result);

      const score = result.condition_score ?? '—';
      const price = result.pricing?.suggested_price;
      if (price) setStartPrice(price.toFixed(2));

      setSidebarSummary({
        camera: brand + ' ' + model,
        score,
        price: price ? price.toFixed(2) : null,
        imageUrl: result.images?.[0]?.storage?.image_url
      });
      setListingTitle(`${brand} ${model}`);
      setStep(2);
    } catch (err) {
      alert('Analysis failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessAuctionId(null);

    const sp = Number(startPrice);
    const cameraId = Number(analysisResult?.camera_id);
    if (!sp || !endDate) {
      setErrorMsg('Please fill in start price and end date.');
      return;
    }

    if (!cameraId) {
      setErrorMsg('Camera analysis must complete successfully before creating an auction.');
      return;
    }

    setLoading(true);

    try {
      const imageUrl = analysisResult?.images?.[0]?.storage?.image_url || '';
      const suggestedPrice = analysisResult?.pricing?.suggested_price ?? null;

      // Convert local datetime-local value to UTC ISO string for backend
      const endTimeUTC = new Date(endDate).toISOString().slice(0, 19);

      const auctionPayload = {
        seller_id:    storedUser.user_id,
        camera_id:    cameraId,
        start_price:  sp,
        end_time:     endTimeUTC,
        s3_image_url: imageUrl,
        suggested_price: suggestedPrice
      };

      const aucRes  = await fetch(AUCTION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auctionPayload)
      });
      const aucData = await aucRes.json().catch(() => ({}));

      if (!aucRes.ok && aucRes.status !== 201) {
        throw new Error(aucData?.error || aucData?.message || 'Auction creation failed: ' + aucRes.status);
      }

      const auctionId = aucData.auction_id || aucData?.data?.auction_id || cameraId;

      // Save custom listing title to camera service
      if (listingTitle.trim()) {
        await fetch(`http://localhost/camera/${cameraId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: listingTitle.trim() })
        }).catch(() => {});
      }

      setSuccessAuctionId(auctionId);
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        .page-hero { background:#000; padding:100px 24px 44px; border-bottom:1px solid #1a1a1a; text-align:center; }
        .page-hero-heading { font-family:'Barlow Condensed',sans-serif; font-weight:900; font-size:clamp(52px,7vw,84px); line-height:0.92; text-transform:uppercase; }
        .page-hero-sub { color:var(--muted); font-size:16px; line-height:1.6; max-width:760px; margin:18px auto 0; }
        .main-content { padding:48px 64px 80px; max-width:1380px; margin:0 auto; }
        .content-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(300px,0.8fr); gap:28px; align-items:start; }
        .form-card, .sidebar-card, .state-card { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:32px; }
        .form-section-label, .sidebar-card-title { font-size:11px; font-weight:600; color:var(--accent); letter-spacing:3px; text-transform:uppercase; display:block; margin-bottom:22px; }
        .fields-row { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px; }
        .field-group { margin-bottom:18px; }
        .field-label { display:block; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; }
        .field-input, .field-select { width:100%; background:#090909; color:var(--text); border:1px solid #232323; border-radius:14px; padding:16px; font-size:15px; }
        .field-input:focus, .field-select:focus { outline:none; border-color:var(--accent); }
        .field-help { margin-top:8px; color:var(--muted); font-size:12px; line-height:1.5; }
        .btn-submit { width:100%; padding:16px 24px; margin-top:10px; border-radius:50px; background:var(--accent); color:var(--text); border:none; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
        .btn-submit:disabled { opacity:0.65; cursor:not-allowed; }
        .sidebar-card { display:grid; gap:14px; }
        .sidebar-bullets { list-style:none; display:grid; gap:10px; }
        .sidebar-bullets li { color:var(--muted); font-size:14px; line-height:1.55; display:flex; gap:10px; }
        .sidebar-bullets li::before { content:'→'; color:var(--accent); font-weight:700; }
        .state-card { display:none; margin-top:18px; }
        .state-card.visible { display:block; }
        .state-title { font-family:'Barlow Condensed',sans-serif; font-size:30px; text-transform:uppercase; margin-bottom:12px; }
        .state-card.success { border-left:3px solid var(--success); background:rgba(48,209,88,0.05); }
        .state-card.error-card { border-left:3px solid var(--danger); background:rgba(255,69,58,0.06); }
        .state-card.success .state-title { color:var(--success); }
        .state-card.error-card .state-title { color:var(--danger); }
        .state-text { color:var(--muted); line-height:1.7; font-size:14px; }
        .state-id { margin:16px 0 20px; padding:14px 16px; border:1px solid #2a2a2a; border-radius:14px; background:#090909; }
        .state-id span { display:block; font-size:11px; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:6px; }
        .state-id strong { font-family:'Barlow Condensed',sans-serif; font-size:36px; }
        .state-actions { display:flex; gap:12px; flex-wrap:wrap; }
        .user-chip { padding:10px 16px; border-radius:14px; border:1px solid #232323; background:#090909; margin-bottom:18px; }
        .user-chip span { display:block; font-size:11px; color:var(--muted); letter-spacing:1.4px; text-transform:uppercase; margin-bottom:6px; }
        .user-chip strong { font-family:'Barlow Condensed',sans-serif; font-size:32px; }
        .hidden { display:none !important; }
        .stepper { display:flex; align-items:center; gap:0; margin-bottom:28px; }
        .step { display:flex; align-items:center; gap:10px; font-size:13px; font-weight:500; color:var(--muted); }
        .step-num { width:26px; height:26px; border-radius:50%; border:1.5px solid var(--muted); display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0; }
        .step.active { color:var(--text); }
        .step.active .step-num { border-color:var(--accent); background:var(--accent); color:#fff; }
        .step.done .step-num { border-color:var(--success); background:var(--success); color:#fff; }
        .step.done { color:var(--muted); }
        .step-line { flex:1; height:1px; background:var(--border); margin:0 12px; min-width:24px; }
        .upload-zone { border:2px dashed #2e2e2e; border-radius:14px; padding:36px 24px; text-align:center; cursor:pointer; transition:border-color 0.2s, background 0.2s; position:relative; overflow:hidden; }
        .upload-zone:hover, .upload-zone.drag-over { border-color:var(--accent); background:rgba(230,57,70,0.04); }
        .upload-icon { color:var(--muted); margin-bottom:12px; }
        .upload-label { font-size:14px; font-weight:500; color:var(--text); display:block; margin-bottom:4px; }
        .upload-hint { font-size:12px; color:var(--muted); }
        .upload-preview { max-width:100%; max-height:180px; border-radius:10px; margin-top:14px; }
        .result-panel { background:var(--surface2); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:20px; }
        .result-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:14px; }
        .result-item { background:#090909; border:1px solid #232323; border-radius:12px; padding:14px; }
        .result-item-label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
        .result-item-value { font-family:'Barlow Condensed',sans-serif; font-size:28px; font-weight:700; }
        .result-item-value.accent { color:var(--accent); }
        .result-item-value.success { color:var(--success); }
        .result-img { width:100%; max-height:160px; object-fit:cover; border-radius:10px; margin-top:14px; }
        .progress-card { text-align:center; padding:40px 24px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .progress-spinner { width:40px; height:40px; border:3px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px; }
        .progress-label-text { font-size:14px; color:var(--muted); }
        .auth-error-card { border-left:3px solid var(--danger); background:rgba(255,69,58,0.06); border-radius:20px; padding:32px; }
        .btn-link { border-radius:50px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; cursor:pointer; color:var(--text); background:transparent; border:1px solid var(--border); padding:8px 20px; }
        @media (max-width:960px) {
          .main-content { padding:36px 20px 64px; }
          .content-grid, .fields-row { grid-template-columns:1fr; }
          .result-grid { grid-template-columns:1fr 1fr; }
        }
      `}</style>

      <div className="page-hero">
        <span className="overline">Create</span>
        <h1 className="page-hero-heading">List a New Auction</h1>
        <p className="page-hero-sub">Upload your camera photo and we'll verify it with AI, score its condition, and suggest a starting price — then list it as an auction in seconds.</p>
      </div>

      <div className="main-content">
        <div className="content-grid">
          <div>
            <div className="form-card">
              {!isLoggedIn ? (
                <div className="auth-error-card">
                  <div className="state-title" style={{ color: 'var(--danger)', fontFamily: 'Barlow Condensed', fontSize: '30px', textTransform: 'uppercase', marginBottom: '12px' }}>Sign In First</div>
                  <p className="state-text">You need to be signed in to list a camera for auction.</p>
                  <div className="state-actions" style={{ marginTop: '18px' }}>
                    <Link to="/login" className="btn-submit" style={{ width: 'auto', padding: '10px 20px', marginTop: 0 }}>Sign In</Link>
                    <Link to="/signup" className="btn-link">Create Account</Link>
                  </div>
                </div>
              ) : (
                <>
                  {/* Stepper */}
                  <div className="stepper">
                    <div className={`step${step === 1 ? ' active' : ' done'}`}>
                      <div className="step-num">1</div>
                      <span>Camera Details</span>
                    </div>
                    <div className="step-line"></div>
                    <div className={`step${step === 2 ? ' active' : ''}`}>
                      <div className="step-num">2</div>
                      <span>Auction Details</span>
                    </div>
                  </div>

                  {/* STEP 1 */}
                  {step === 1 && !loading && (
                    <>
                      <span className="form-section-label">Camera Details</span>
                      <div className="fields-row">
                        <div className="field-group">
                          <label className="field-label" htmlFor="brand">Brand</label>
                          <input className="field-input" type="text" id="brand" placeholder="e.g. Sony" value={brand} onChange={e => setBrand(e.target.value)} />
                        </div>
                        <div className="field-group">
                          <label className="field-label" htmlFor="model">Model</label>
                          <input className="field-input" type="text" id="model" placeholder="e.g. A6400" value={model} onChange={e => setModel(e.target.value)} />
                        </div>
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="shutterCount">Shutter Count</label>
                        <input className="field-input" type="number" id="shutterCount" placeholder="e.g. 10000" min="0" value={shutterCount} onChange={e => setShutterCount(e.target.value)} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">Camera Photo</label>
                        <div
                          ref={uploadZoneRef}
                          className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFileChange(e.dataTransfer.files[0]); }}
                        >
                          <input type="file" accept=".jpg,.jpeg,.png,.webp" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={e => handleFileChange(e.target.files[0])} />
                          <div className="upload-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          </div>
                          <span className="upload-label">Click or drag to upload</span>
                          <span className="upload-hint">JPG, PNG or WEBP</span>
                          {previewUrl && <img src={previewUrl} className="upload-preview" alt="preview" />}
                        </div>
                      </div>
                      <button className="btn-submit" onClick={handleAnalyse}>Analyse Camera</button>
                    </>
                  )}

                  {/* Loading / Progress */}
                  {loading && (
                    <div className="progress-card">
                      <div className="progress-spinner"></div>
                      <div className="progress-label-text">{progressLabel}</div>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {step === 2 && !loading && (
                    <>
                      <span className="form-section-label">AI Analysis Results</span>
                      <div className="result-panel">
                        {sidebarSummary?.imageUrl && <img src={sidebarSummary.imageUrl} className="result-img" alt="Uploaded camera" />}
                        <div className="result-grid">
                          <div className="result-item">
                            <div className="result-item-label">Camera</div>
                            <div className="result-item-value" style={{ fontSize: '18px', lineHeight: '1.3' }}>{brand} {model}</div>
                          </div>
                          <div className="result-item">
                            <div className="result-item-label">Condition Score</div>
                            <div className="result-item-value accent">{(analysisResult?.condition_score ?? '—') + ' / 10'}</div>
                          </div>
                          <div className="result-item">
                            <div className="result-item-label">Suggested Price</div>
                            <div className="result-item-value success">
                              {analysisResult?.pricing?.suggested_price ? 'SGD ' + analysisResult.pricing.suggested_price.toFixed(2) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <span className="form-section-label" style={{ marginTop: '8px' }}>Auction Details</span>
                      <div className="field-group">
                        <label className="field-label" htmlFor="listingTitle">Listing Title</label>
                        <input
                          className="field-input"
                          type="text"
                          id="listingTitle"
                          placeholder="e.g. Sony A6400 Mirrorless"
                          value={listingTitle}
                          onChange={e => setListingTitle(e.target.value)}
                        />
                        <div className="field-help">Pre-filled from brand and model. You can customise this.</div>
                      </div>
                      <div className="user-chip">
                        <span>Logged In User</span>
                        <strong>{storedUser.user_id}</strong>
                      </div>

                      {successAuctionId ? (
                        <div className="state-card success visible">
                          <div className="state-title">Auction Created</div>
                          <p className="state-text">Your camera has been verified, saved, and listed. It will appear in the auctions page immediately.</p>
                          <div className="state-id"><span>Auction ID</span><strong>{successAuctionId}</strong></div>
                          <div className="state-actions">
                            <Link to="/auctions" className="btn-submit" style={{ width: 'auto', padding: '10px 20px', marginTop: 0 }}>View Auctions</Link>
                            <button className="btn-link" onClick={() => { setStep(1); setAnalysisResult(null); setSidebarSummary(null); setSuccessAuctionId(null); setErrorMsg(''); setBrand(''); setModel(''); setShutterCount(''); setImageFile(null); setPreviewUrl(''); setListingTitle(''); }}>Create Another</button>
                          </div>
                        </div>
                      ) : (
                        <form onSubmit={handleSubmit} noValidate>
                          <div className="fields-row">
                            <div className="field-group">
                              <label className="field-label" htmlFor="sellerId">Seller ID</label>
                              <input className="field-input" type="number" id="sellerId" readOnly value={storedUser.user_id} />
                              <div className="field-help">Auto-filled from your account.</div>
                            </div>
                            <div className="field-group">
                              <label className="field-label" htmlFor="startPrice">Start Price (SGD)</label>
                              <input className="field-input" type="number" id="startPrice" placeholder="e.g. 500" min="1" step="0.01" required value={startPrice} onChange={e => setStartPrice(e.target.value)} />
                              <div className="field-help">Pre-filled from AI price model. You can adjust.</div>
                            </div>
                          </div>
                          <div className="field-group">
                            <label className="field-label" htmlFor="endDate">End Date &amp; Time</label>
                            <input className="field-input" type="datetime-local" id="endDate" required value={endDate} onChange={e => setEndDate(e.target.value)} />
                          </div>
                          {errorMsg && (
                            <div className="state-card error-card visible" style={{ display: 'block' }}>
                              <div className="state-title">Submission Failed</div>
                              <p className="state-text">{errorMsg}</p>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button type="button" className="btn-link" style={{ flex: '0 0 auto' }} onClick={() => { setStep(1); setSuccessAuctionId(null); setErrorMsg(''); }}>← Back</button>
                            <button type="submit" className="btn-submit" style={{ flex: 1 }} disabled={loading}>
                              {loading ? 'Saving…' : 'Create Auction'}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div>
            <div className="sidebar-card">
              <div className="sidebar-card-title">How This Works</div>
              <ul className="sidebar-bullets">
                <li>Upload a photo of your camera — our AI verifies it's a real camera.</li>
                <li>Google Vision scores the condition (0–10) based on labels and text in the image.</li>
                <li>The price model suggests a starting price using live market data.</li>
                <li>Your camera is saved and the auction is created in one step.</li>
              </ul>
            </div>
            {sidebarSummary && (
              <div className="sidebar-card" style={{ marginTop: '28px' }}>
                <div className="sidebar-card-title">Analysis Summary</div>
                <ul className="sidebar-bullets">
                  <li>Brand / Model: <strong style={{ color: 'var(--text)' }}>{sidebarSummary.camera}</strong></li>
                  <li>Condition Score: <strong style={{ color: 'var(--accent)' }}>{sidebarSummary.score} / 10</strong></li>
                  <li>Suggested Price: <strong style={{ color: 'var(--success)' }}>SGD {sidebarSummary.price || '—'}</strong></li>
                  <li>Image saved to S3.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
