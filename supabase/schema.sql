-- Run once in Supabase > SQL Editor
create table admins(user_id uuid primary key references auth.users on delete cascade);
create function is_admin() returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from admins where user_id=auth.uid()) $$;

create table players(id text primary key,name text not null,image text default '',country text,role text,bat text default '',bowl text default '',category text default '',
 base_price bigint not null check(base_price>0),status text not null default 'Available' check(status in('Available','Upcoming','Live','Sold','Unsold')),
 team_id text,sold_price bigint,sold_at timestamptz);
create table teams(id text primary key,name text not null,purse bigint not null check(purse>=0),max_squad int not null check(max_squad>0),
 spent bigint not null default 0,squad_count int not null default 0,logo text,check(spent<=purse),check(squad_count<=max_squad));
create table team_contacts(team_id text primary key references teams on delete cascade,manager text,email text,whatsapp text,email_pref bool default false,wa_pref bool default false,wa_consent bool default false);
create table auction(id int primary key default 1 check(id=1),player_id text,state text default 'idle',current_bid bigint default 0,bid_team_id text,timer_end bigint,remaining_ms bigint);
create table history(player_id text primary key,name text,team_id text,team text,price bigint,status text,at timestamptz default now());
create table notifications(player_id text primary key,name text,team text,email_status text default 'Pending',email_error text,wa_status text default 'Pending',created_at timestamptz default now(),updated_at timestamptz default now());

insert into teams(id,name,purse,max_squad) values('t1','Karachi Kings',200000000,20),('t2','Lahore Qalandars',200000000,20),('t3','Islamabad United',200000000,20),
 ('t4','Peshawar Zalmi',200000000,20),('t5','Quetta Gladiators',200000000,20),('t6','Multan Sultans',200000000,20);
insert into team_contacts(team_id) select id from teams; insert into auction(id) values(1);

-- Row Level Security: public read-only on auction data; everything else admin-only
do $$ declare t text; begin
 foreach t in array array['players','teams','auction','history'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy pub_read on %I for select using(true)',t);
  execute format('create policy adm_all on %I for all using(is_admin()) with check(is_admin())',t);
 end loop;
 foreach t in array array['team_contacts','notifications'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy adm_all on %I for all using(is_admin()) with check(is_admin())',t);
 end loop;
end $$;
alter table admins enable row level security;
create policy self_read on admins for select using(user_id=auth.uid());

-- Atomic, idempotent SOLD (row locks; repeat calls return duplicate:true and change nothing)
create function mark_sold(p_player text,p_team text,p_price bigint) returns json language plpgsql security definer set search_path=public as $$
declare pl players%rowtype; t teams%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.status='Sold' then return json_build_object('duplicate',true); end if;
 if p_price<pl.base_price then raise exception 'Price below base price'; end if;
 select * into t from teams where id=p_team for update; if not found then raise exception 'Team not found'; end if;
 if t.spent+p_price>t.purse then raise exception 'Exceeds team purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad full'; end if;
 update teams set spent=spent+p_price,squad_count=squad_count+1 where id=p_team;
 update players set status='Sold',team_id=p_team,sold_price=p_price,sold_at=now() where id=p_player;
 insert into history(player_id,name,team_id,team,price,status) values(p_player,pl.name,p_team,t.name,p_price,'Sold') on conflict(player_id) do update set team_id=excluded.team_id,team=excluded.team,price=excluded.price,status='Sold',at=now();
 insert into notifications(player_id,name,team) values(p_player,pl.name,t.name) on conflict do nothing;
 update auction set state='sold',current_bid=p_price,bid_team_id=p_team where id=1;
 return json_build_object('ok',true);
end $$;

create function reset_auction() returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from history where true; delete from notifications where true;
 update players set status='Available',team_id=null,sold_price=null,sold_at=null where true;
 update teams set spent=0,squad_count=0 where true;
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null where id=1; end $$;
revoke execute on function mark_sold,reset_auction from public,anon; grant execute on function mark_sold,reset_auction to authenticated;

alter publication supabase_realtime add table players,teams,auction,history,notifications;
