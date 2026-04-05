FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Generate Python gRPC code from the proto file at build time
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. order.proto
EXPOSE 5004 50051
CMD ["python", "app.py"]
