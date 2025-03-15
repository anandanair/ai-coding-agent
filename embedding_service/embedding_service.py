from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

app = FastAPI()
# Load the local embedding model; you can change the model as needed.
model = SentenceTransformer('all-MiniLM-L6-v2')

class EmbeddingRequest(BaseModel):
    text: str

@app.post("/embedding")
def get_embedding(request: EmbeddingRequest):
    embedding = model.encode(request.text).tolist()
    return {"embedding": embedding}

if __name__ == "__main__":  
    uvicorn.run(app, host="0.0.0.0", port=8000)
