-- Run once in Supabase > SQL Editor (after update-features.sql)
create table rules(key text primary key,val bigint not null);
insert into rules values('foreign_max',7),('min_squad',15),('reserve_per_slot',6000000),('cooldown_sec',2),('min_batter',4),('min_wk',2),('min_ar',2),('min_bowler',4);
create table announcement(id int primary key default 1 check(id=1),text text not null default '',updated_at timestamptz default now());
insert into announcement(id) values(1);
alter table auction add column callout text;      -- 'once' / 'twice' / null
do $$ declare t text; begin foreach t in array array['rules','announcement'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy pub_read on %I for select using(true)',t);
 execute format('create policy adm_all on %I for all using(is_admin()) with check(is_admin())',t);
end loop; end $$;
alter publication supabase_realtime add table rules,announcement;

create function rule(k text,d bigint) returns bigint language sql stable set search_path=public as $$ select coalesce((select val from rules where key=k),d) $$;
create function is_foreign(c text) returns boolean language sql immutable as $$ select coalesce(trim(c),'')<>'' and lower(trim(c))<>'pakistan' $$;
create function fmt_rs(n bigint) returns text language sql immutable as $$ select 'Rs. '||to_char(n,'FM999,999,999,999') $$;

-- Foreign-player limit and purse reserve (used by bids, SOLD and direct signing)
create function check_rules(p_team text,p_player text,p_price bigint,p_reserve boolean default true) returns void language plpgsql security definer set search_path=public as $$
declare t teams%rowtype; pl players%rowtype; fc int; need int;
begin
 select * into t from teams where id=p_team; select * into pl from players where id=p_player;
 if is_foreign(pl.country) then
  select count(*) into fc from players where team_id=p_team and status='Sold' and is_foreign(country);
  if fc>=rule('foreign_max',7) then raise exception 'Foreign player limit (%) reached',rule('foreign_max',7); end if;
 end if;
 if p_reserve then
  need:=greatest(rule('min_squad',15)-(t.squad_count+1),0);
  if t.purse-t.spent-p_price<need*rule('reserve_per_slot',0) then
   raise exception 'You must keep % in reserve for % more players',fmt_rs(need*rule('reserve_per_slot',0)),need; end if;
 end if;
end $$;
revoke execute on function check_rules from public,anon;

create or replace function place_bid(p_team text,p_code text,p_bid bigint) returns json language plpgsql security definer set search_path=public as $$
declare a auction%rowtype; t teams%rowtype; pl players%rowtype; nowms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
begin
 if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 if exists(select 1 from bids where team_id=p_team and at>now()-make_interval(secs=>rule('cooldown_sec',2)::double precision)) then raise exception 'Please wait a moment before bidding again'; end if;
 select * into a from auction where id=1 for update;
 if a.state<>'live' then raise exception 'Bidding is not open right now'; end if;
 if a.timer_end is not null and nowms>a.timer_end then raise exception 'Time is up'; end if;
 if a.bid_team_id=p_team then raise exception 'You already hold the highest bid'; end if;
 select * into pl from players where id=a.player_id;
 if p_bid<pl.base_price then raise exception 'Below base price'; end if;
 if a.bid_team_id is null and p_bid<a.current_bid then raise exception 'Bid too low'; end if;
 if a.bid_team_id is not null and p_bid<a.current_bid+bid_step(a.current_bid) then raise exception 'Minimum bid is %',fmt_rs(a.current_bid+bid_step(a.current_bid)); end if;
 select * into t from teams where id=p_team for update;
 if t.spent+p_bid>t.purse then raise exception 'Not enough purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad is full'; end if;
 perform check_rules(p_team,a.player_id,p_bid,true);
 insert into bids(player_id,team_id,amount) values(a.player_id,p_team,p_bid);
 update auction set current_bid=p_bid,bid_team_id=p_team,callout=null,timer_end=case when timer_end is null then null else greatest(timer_end,nowms+10000) end where id=1;
 return json_build_object('ok',true);
end $$;

create or replace function mark_sold(p_player text,p_team text,p_price bigint) returns json language plpgsql security definer set search_path=public as $$
declare pl players%rowtype; t teams%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.status='Sold' then return json_build_object('duplicate',true); end if;
 if p_price<pl.base_price then raise exception 'Price below base price'; end if;
 select * into t from teams where id=p_team for update; if not found then raise exception 'Team not found'; end if;
 if t.spent+p_price>t.purse then raise exception 'Exceeds team purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad full'; end if;
 perform check_rules(p_team,p_player,p_price,true);
 update teams set spent=spent+p_price,squad_count=squad_count+1 where id=p_team;
 update players set status='Sold',team_id=p_team,sold_price=p_price,sold_at=now() where id=p_player;
 insert into history(player_id,name,team_id,team,price,status) values(p_player,pl.name,p_team,t.name,p_price,'Sold')
  on conflict(player_id) do update set team_id=excluded.team_id,team=excluded.team,price=excluded.price,status='Sold',at=now();
 insert into notifications(player_id,name,team) values(p_player,pl.name,t.name) on conflict do nothing;
 update auction set state='sold',current_bid=p_price,bid_team_id=p_team,callout=null where id=1;
 return json_build_object('ok',true);
end $$;

create or replace function assign_player(p_player text,p_team text,p_type text,p_price bigint default 0) returns json language plpgsql security definer set search_path=public as $$
declare pl players%rowtype; t teams%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 if p_type not in('Retention','Direct signing') then raise exception 'Bad type'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.status in('Sold','Live') then raise exception 'Player is already sold or live'; end if;
 select * into t from teams where id=p_team for update; if not found then raise exception 'Team not found'; end if;
 if p_price<0 then raise exception 'Bad price'; end if;
 if t.spent+p_price>t.purse then raise exception 'Exceeds team purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad full'; end if;
 perform check_rules(p_team,p_player,p_price,false);
 update teams set spent=spent+p_price,squad_count=squad_count+1 where id=p_team;
 update players set status='Sold',team_id=p_team,sold_price=p_price,sold_at=now(),acq=p_type where id=p_player;
 insert into history(player_id,name,team_id,team,price,status) values(p_player,pl.name,p_team,t.name,p_price,p_type)
  on conflict(player_id) do update set team_id=excluded.team_id,team=excluded.team,price=excluded.price,status=excluded.status,at=now();
 return json_build_object('ok',true);
end $$;
