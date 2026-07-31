create extension if not exists vector;

create table if not exists usercategory (
  category_id integer generated always as identity primary key,
  categoryname varchar(50) unique not null
);

create table if not exists users (
  id integer generated always as identity primary key,
  username varchar(50) not null,
  category_id integer not null references usercategory(category_id),
  unique (username, category_id)
);

create table if not exists message (
  message_id integer generated always as identity primary key,
  user_id integer not null references users(id),
  userinput text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Safe to run if the original tables were already created from the supplied schema.
alter table message
  add column if not exists created_at timestamptz not null default now();

create index if not exists message_embedding_hnsw_idx
  on message using hnsw (embedding vector_cosine_ops);

create or replace function match_messages(
  query_embedding vector(1536),
  match_count integer default 10
)
returns table (
  message_id integer,
  user_id integer,
  userinput text,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    message.message_id,
    message.user_id,
    message.userinput,
    message.created_at,
    1 - (message.embedding <=> query_embedding) as similarity
  from message
  order by message.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;
