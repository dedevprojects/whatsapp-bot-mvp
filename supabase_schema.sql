-- ============================================================
-- Supabase SQL Schema for the Universal WhatsApp Bot Engine
-- Run this in your Supabase project → SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists businesses (
  id               uuid primary key default uuid_generate_v4(),
  business_name    text        not null,
  whatsapp_number  text        not null unique,  -- E.164 e.g. +5491112345678
  welcome_message  text        not null default 'Hola 👋 ¿En qué te puedo ayudar?',
  menu_options     jsonb       not null default '{}',
  responses        jsonb       not null default '{}',
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- Messages log table (Optional but highly recommended)
-- ============================================================

create table if not exists messages (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid        references businesses(id),
  sender_jid       text        not null,
  message_text     text,
  direction        text        not null check (direction in ('inbound', 'outbound')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_messages_business on messages(business_id);
create index if not exists idx_messages_sender on messages(sender_jid);

-- Keep updated_at current automatically
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

-- Index for fast lookups by phone number
create index if not exists idx_businesses_number on businesses(whatsapp_number);

-- ============================================================
-- Example record — Restaurante Roma
-- ============================================================

insert into businesses (
  business_name,
  whatsapp_number,
  welcome_message,
  menu_options,
  responses
) values (
  'Restaurante Roma',
  '+5491112345678',
  'Hola 👋 Bienvenido a Restaurante Roma 🍝',
  '{
    "1": "Ver menú",
    "2": "Reservar mesa",
    "3": "Horarios",
    "4": "Ubicación"
  }',
  '{
    "1": "Te paso nuestro menú 👉 https://menu.restauranteroma.com",
    "2": "¡Con gusto! Decime el día, hora y cantidad de personas para la reserva.",
    "3": "Abrimos de lunes a domingo de 12:00 a 23:00 hs 🕛",
    "4": "Estamos en Av. Siempre Viva 123, Ciudad 📍"
  }'
) on conflict (whatsapp_number) do nothing;
