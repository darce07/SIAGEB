create extension if not exists vector;

create table if not exists public.doc_documents (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  source_path text,
  mime_type text,
  tags jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.doc_chunks (
  id uuid primary key default uuid_generate_v4(),
  doc_id uuid not null references public.doc_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(768),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists doc_chunks_doc_id_idx on public.doc_chunks(doc_id);
create index if not exists doc_chunks_embedding_idx
  on public.doc_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_doc_chunks(
  query_embedding vector(768),
  match_count int default 5,
  min_similarity float default 0.15
)
returns table (
  doc_id uuid,
  chunk_id uuid,
  content text,
  similarity float,
  metadata jsonb
)
language sql
stable
as $$
  select
    doc_id,
    id as chunk_id,
    content,
    1 - (embedding <=> query_embedding) as similarity,
    metadata
  from public.doc_chunks
  where embedding is not null
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;

alter table public.doc_documents enable row level security;
alter table public.doc_chunks enable row level security;

drop policy if exists doc_documents_read_policy on public.doc_documents;
create policy doc_documents_read_policy
  on public.doc_documents
  for select
  using (auth.role() = 'authenticated');

drop policy if exists doc_documents_admin_write_policy on public.doc_documents;
create policy doc_documents_admin_write_policy
  on public.doc_documents
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists doc_chunks_read_policy on public.doc_chunks;
create policy doc_chunks_read_policy
  on public.doc_chunks
  for select
  using (auth.role() = 'authenticated');

drop policy if exists doc_chunks_admin_write_policy on public.doc_chunks;
create policy doc_chunks_admin_write_policy
  on public.doc_chunks
  for all
  using (public.is_admin_user())
  with check (public.is_admin_user());
