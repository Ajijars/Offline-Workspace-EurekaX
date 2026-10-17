"""
Embedding Service – Local BGE embeddings generation.

Uses sentence-transformers with BAAI/bge-small-en-v1.5 model.
Generates 384-dimensional embeddings entirely offline.
"""

import logging
from typing import Optional

import numpy as np

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Singleton service for generating text embeddings using BGE-small.
    
    The model is loaded lazily on first use to avoid slow startup.
    BGE models use a special query prefix for retrieval tasks.
    """

    _instance: Optional["EmbeddingService"] = None
    _model = None
    _sparse_model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, "_initialized"):
            settings = get_settings()
            self.model_name = settings.EMBEDDING_MODEL
            self.dimension = settings.EMBEDDING_DIMENSION
            # BGE models need a query prefix for better retrieval
            self.query_prefix = "Represent this sentence for searching relevant passages: "
            self._initialized = True

    def _load_model(self):
        """Lazy-load the sentence-transformers model (preferring CUDA GPU if available)."""
        if self._model is None:
            logger.info(f"Loading embedding model: {self.model_name}...")
            from sentence_transformers import SentenceTransformer
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                device = "cpu"
            logger.info(f"Embedding model target device: {device}")
            self._model = SentenceTransformer(self.model_name, device=device)
            logger.info(f"Embedding model loaded (dim={self.dimension}, device={device})")
        return self._model

    def _load_sparse_model(self):
        """Lazy-load the fastembed sparse model (BM25). Falls back gracefully if unavailable."""
        if self._sparse_model is None:
            try:
                from fastembed import SparseTextEmbedding
                logger.info("Loading sparse embedding model: Qdrant/bm25...")
                self._sparse_model = SparseTextEmbedding("Qdrant/bm25")
                logger.info("Sparse embedding model loaded.")
            except ImportError:
                logger.warning("fastembed not installed. Falling back to dense-only embeddings.")
                self._sparse_model = False
            except Exception as e:
                logger.warning(f"Could not load sparse embedding model ({e}). Falling back to dense-only.")
                self._sparse_model = False
        return self._sparse_model if self._sparse_model is not False else None

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of document texts.

        Args:
            texts: List of text strings to embed.

        Returns:
            List of embedding vectors (each is a list of floats).
        """
        if not texts:
            return []

        model = self._load_model()

        logger.info(f"Embedding {len(texts)} text chunks...")
        embeddings = model.encode(
            texts,
            show_progress_bar=False,
            normalize_embeddings=True,  # L2 normalize for cosine similarity
            batch_size=32
        )

        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a search query.

        BGE models perform better when queries are prefixed with a
        special instruction string for retrieval tasks.

        Args:
            query: The search query string.

        Returns:
            Single embedding vector as a list of floats.
        """
        model = self._load_model()

        # Add BGE query prefix for better retrieval
        prefixed_query = f"{self.query_prefix}{query}"

        embedding = model.encode(
            [prefixed_query],
            show_progress_bar=False,
            normalize_embeddings=True
        )

        return embedding[0].tolist()

    @property
    def is_loaded(self) -> bool:
        """Check if the model has been loaded."""
        return self._model is not None

    def embed_sparse_texts(self, texts: list[str]) -> list[dict]:
        """
        Generate sparse embeddings for a list of document texts (BM25).
        Returns a list of dicts: [{"indices": [...], "values": [...]}, ...]
        """
        if not texts:
            return []
        
        model = self._load_sparse_model()
        if model is None:
            return [{"indices": [], "values": []} for _ in texts]

        logger.info(f"Generating sparse embeddings for {len(texts)} chunks...")
        try:
            # model.embed returns a generator yielding SparseEmbedding objects
            embeddings_gen = model.embed(texts)
            results = []
            for e in embeddings_gen:
                results.append({
                    "indices": e.indices.tolist() if hasattr(e.indices, 'tolist') else list(e.indices),
                    "values": e.values.tolist() if hasattr(e.values, 'tolist') else list(e.values)
                })
            return results
        except Exception as e:
            logger.warning(f"Sparse embedding generation failed: {e}. Falling back to empty sparse vectors.")
            return [{"indices": [], "values": []} for _ in texts]

    def embed_sparse_query(self, query: str) -> dict:
        """
        Generate a sparse embedding for a search query.
        Returns a dict: {"indices": [...], "values": [...]}
        """
        model = self._load_sparse_model()
        if model is None:
            return {"indices": [], "values": []}

        try:
            # FastEmbed handles the query same as texts, no specific prefix needed for BM25
            embeddings_gen = list(model.embed([query]))
            e = embeddings_gen[0]
            return {
                "indices": e.indices.tolist() if hasattr(e.indices, 'tolist') else list(e.indices),
                "values": e.values.tolist() if hasattr(e.values, 'tolist') else list(e.values)
            }
        except Exception as e:
            logger.warning(f"Sparse query embedding failed: {e}. Falling back to empty sparse vector.")
            return {"indices": [], "values": []}


# Singleton instance
embedding_service = EmbeddingService()
