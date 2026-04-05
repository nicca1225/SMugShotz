FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Generate gRPC client code from the shared proto contract
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. order.proto
EXPOSE 5012
CMD ["python", "main.py"]
