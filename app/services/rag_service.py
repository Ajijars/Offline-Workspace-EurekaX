"""
RAG Service – Retrieval-Augmented Generation orchestration.

Ties together document ingestion, chunking, embeddings, vector search,
and LLM generation into a complete RAG pipeline.

Pipeline:
    Ingest:  File → Extract Text → Chunk → Embed → Store in Qdrant
    Query:   Question → Embed → Search Qdrant → Build Context → LLM → Answer
"""

import json
import logging
import time
from typing import AsyncGenerator

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.services.document_service import document_service
from app.services.embedding_service import embedding_service
from app.services.vector_service import vector_service
from app.services.llm_service import ollama_service

logger = logging.getLogger(__name__)


class RAGService:
    """
    Orchestrates the full RAG pipeline.
    
    Coordinates between document, embedding, vector, and LLM services
    to provide document-grounded question answering.
    """

    def __init__(self):
        settings = get_settings()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        self.default_top_k = settings.RAG_TOP_K

    # ──────────────────────────────────────────────
    # Document Ingestion Pipeline
    # ──────────────────────────────────────────────

    async def ingest_document(self, file) -> dict:
        """
        Full document ingestion pipeline:
        1. Extract text from uploaded file
        2. Split into chunks using LangChain
        3. Generate embeddings with BGE-small
        4. Store in Qdrant vector database

        Args:
            file: FastAPI UploadFile object

        Returns:
            Dict with doc_id, filename, chunk_count, status
        """
        start_time = time.time()

        # Step 1: Extract text
        logger.info(f"[RAG Ingest] Step 1: Extracting text from {file.filename}")
        doc_result = await document_service.process_file(file)

        if not doc_result.text.strip():
            raise ValueError(f"No text could be extracted from {file.filename}")

        # Step 2: Split into chunks
        logger.info(f"[RAG Ingest] Step 2: Splitting into chunks")
        chunks = self.text_splitter.split_text(doc_result.text)

        if not chunks:
            raise ValueError(f"Document produced 0 chunks after splitting")

        logger.info(f"  → {len(chunks)} chunks created")

        # Step 3: Generate embeddings
        logger.info(f"[RAG Ingest] Step 3: Generating embeddings")
        vectors = embedding_service.embed_texts(chunks)
        sparse_vectors = embedding_service.embed_sparse_texts(chunks)
        logger.info(f"  → {len(vectors)} dense and sparse embeddings generated")

        # Step 4: Store in Qdrant
        logger.info(f"[RAG Ingest] Step 4: Storing in Qdrant")
        points_stored = await vector_service.upsert_chunks(
            doc_id=doc_result.doc_id,
            chunks=chunks,
            vectors=vectors,
            sparse_vectors=sparse_vectors,
            metadata={
                "filename": doc_result.filename,
                "file_type": doc_result.file_type,
                "file_path": doc_result.metadata.get("saved_path", ""),
                "page_count": doc_result.page_count,
            }
        )

        elapsed = time.time() - start_time
        logger.info(
            f"[RAG Ingest] Complete: {doc_result.filename} → "
            f"{points_stored} chunks in {elapsed:.2f}s"
        )

        return {
            "doc_id": doc_result.doc_id,
            "filename": doc_result.filename,
            "chunk_count": points_stored,
            "page_count": doc_result.page_count,
            "file_type": doc_result.file_type,
            "processing_time_ms": round(elapsed * 1000, 2),
            "status": "indexed"
        }

    # ──────────────────────────────────────────────
    # RAG Query Pipeline
    # ──────────────────────────────────────────────

    async def query(
        self,
        question: str,
        top_k: int | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        conversation_history: list[dict] | None = None,
    ) -> dict:
        """
        RAG query pipeline (non-streaming):
        1. Embed the question
        2. Search Qdrant for similar chunks
        3. Build context-augmented prompt
        4. Generate answer with Ollama

        Returns:
            Dict with answer, sources, model, timing
        """
        start_time = time.time()
        top_k = top_k or self.default_top_k

        # Step 1: Embed query (Dense + Sparse)
        query_vector = embedding_service.embed_query(question)
        sparse_query_vector = embedding_service.embed_sparse_query(question)

        # Step 2: Search for relevant chunks
        search_results = await vector_service.search(
            query_vector=query_vector,
            sparse_query_vector=sparse_query_vector,
            top_k=top_k
        )

        if not search_results:
            return {
                "answer": "I couldn't find any relevant information in the indexed documents. "
                          "Please upload documents first or try rephrasing your question.",
                "sources": [],
                "model": model or "",
                "total_duration_ms": round((time.time() - start_time) * 1000, 2),
            }

        # Step 3: Build context-augmented prompt
        context_prompt = self._build_rag_prompt(question, search_results, conversation_history)

        # Step 4: Generate answer with LLM
        result = await ollama_service.generate(
            prompt=context_prompt,
            model=model,
            temperature=temperature,
        )

        elapsed = time.time() - start_time

        return {
            "answer": result["response"],
            "sources": search_results,
            "model": result["model"],
            "total_duration_ms": round(elapsed * 1000, 2),
            "tokens_per_second": result.get("tokens_per_second"),
        }

    async def query_stream(
        self,
        question: str,
        top_k: int | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        conversation_history: list[dict] | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        RAG query pipeline with streaming response.

        First yields the sources, then streams the LLM answer token-by-token.
        """
        top_k = top_k or self.default_top_k

        # Step 1: Embed query
        query_vector = embedding_service.embed_query(question)
        sparse_query_vector = embedding_service.embed_sparse_query(question)

        # Step 2: Search for relevant chunks
        search_results = await vector_service.search(
            query_vector=query_vector,
            sparse_query_vector=sparse_query_vector,
            top_k=top_k
        )

        # Yield sources first as a special event
        yield json.dumps({
            "type": "sources",
            "sources": search_results,
            "done": False,
        })

        if not search_results:
            yield json.dumps({
                "content": "I couldn't find any relevant information in the indexed documents. "
                           "Please upload documents first or try rephrasing your question.",
                "done": True,
            })
            return

        # Step 3: Build context-augmented prompt
        context_prompt = self._build_rag_prompt(question, search_results, conversation_history)

        # Step 4: Stream answer from LLM
        async for chunk in ollama_service.generate_stream(
            prompt=context_prompt,
            model=model,
            temperature=temperature,
        ):
            yield chunk

    # ──────────────────────────────────────────────
    # Document Management
    # ──────────────────────────────────────────────

    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document from vector store and disk."""
        vector_deleted = await vector_service.delete_document(doc_id)
        file_deleted = document_service.delete_file(doc_id)
        return vector_deleted or file_deleted

    async def list_documents(self) -> list[dict]:
        """List all indexed documents."""
        return await vector_service.list_documents()

    async def get_stats(self) -> dict:
        """Get RAG pipeline statistics."""
        collection_info = await vector_service.get_collection_info()
        documents = await vector_service.list_documents()
        return {
            "collection": collection_info,
            "document_count": len(documents),
            "embedding_model": embedding_service.model_name,
            "embedding_loaded": embedding_service.is_loaded,
        }

    # ──────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────

    def _build_rag_prompt(self, question: str, sources: list[dict], history: list[dict] | None = None) -> str:
        """
        Build a context-augmented prompt for RAG.

        Formats retrieved chunks into a structured context block
        that the LLM can use to generate a grounded answer.
        """
        context_parts = []
        for i, source in enumerate(sources, 1):
            filename = source.get("filename", "unknown")
            score = source.get("score", 0)
            text = source.get("chunk_text", "")
            context_parts.append(
                f"[Source {i} - {filename} (relevance: {score})]:\n{text}"
            )

        context_block = "\n\n".join(context_parts)

        history_block = ""
        if history:
            history_parts = []
            for msg in history:
                role = msg.get("role", "").capitalize()
                content = msg.get("content", "")
                if role and content:
                    history_parts.append(f"{role}: {content}")
            if history_parts:
                history_block = "--- PREVIOUS CONVERSATION ---\n" + "\n".join(history_parts) + "\n\n"

        prompt = (
            "You are a knowledgeable assistant that answers questions based on the provided context. "
            "Use the following retrieved document excerpts to answer the user's question. "
            "If the context doesn't contain enough information, say so honestly. "
            "Always cite which source(s) you used.\n\n"
            f"{history_block}"
            f"--- CONTEXT ---\n{context_block}\n--- END CONTEXT ---\n\n"
            f"Question: {question}\n\n"
            "Answer (cite your sources):"
        )

        return prompt
        
    async def compare_documents(self, doc1_id: str, doc2_id: str, custom_prompt: str = "") -> str:
        """
        Compare two documents by retrieving all their chunks and asking the LLM to map differences.
        """
        # 1. Fetch chunks for doc1
        chunks1 = await vector_service.get_document_chunks(doc1_id)
        if not chunks1:
            return f"Error: Could not find document with ID {doc1_id}"
            
        # 2. Fetch chunks for doc2
        chunks2 = await vector_service.get_document_chunks(doc2_id)
        if not chunks2:
            return f"Error: Could not find document with ID {doc2_id}"
            
        # Combine text (may be large, but local LLMs often handle 8k context)
        text1 = "\n\n".join(chunks1)
        text2 = "\n\n".join(chunks2)
        
        # Truncate slightly if massive (preventing context length overflow for 8k models)
        MAX_CHARS = 12000
        if len(text1) > MAX_CHARS:
            text1 = text1[:MAX_CHARS] + "... (truncated)"
        if len(text2) > MAX_CHARS:
            text2 = text2[:MAX_CHARS] + "... (truncated)"
            
        instructions = custom_prompt if custom_prompt.strip() else "Please compare these two documents. Outline the key differences, commonalities, and any contradictions."
        
        prompt = (
            "You are an expert document analyst. Below are the contents of two distinct documents.\n"
            f"Instruction: {instructions}\n\n"
            "--- DOCUMENT 1 ---\n"
            f"{text1}\n\n"
            "--- DOCUMENT 2 ---\n"
            f"{text2}\n\n"
            "Analysis:"
        )
        
        logger.info(f"[RAG Compare] Comparing {doc1_id} and {doc2_id}")
        
        result = await ollama_service.generate(
            prompt=prompt,
            temperature=0.3
        )
        
        return result["response"]


# Singleton instance
rag_service = RAGService()
