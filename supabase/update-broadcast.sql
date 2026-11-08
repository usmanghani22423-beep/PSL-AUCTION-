-- Run once in Supabase > SQL Editor (after update-xi-power.sql). Broadcast experience upgrade.
-- settings (admin-controlled switches), custom ticker lines, live reaction counts, mystery reveal, timer length, bid-war/last-second flags
create table settings(key text primary key,val text not null);
insert into settings values('audience_on','1'),('reactions_on','1'),('ticker_on','1'),('reveal_on','1'),('sound_enabled','1'),('sound_master','0.8'),
 ('snd_bid','1'),('snd_warn','1'),('snd_sold','1'),('snd_unsold','1'),('snd_applause','1'),('snd_celebrate','1'),('snd_reveal','1'),('snd_war','1');
create table ticker_items(id bigserial primary key,text text not null,created_at timestamptz default now());
create table reaction_counts(id text primary key,player_id text,kind text,n int not null default 0);
do $$ declare t text; begin foreach t in array array['settings','ticker_items','reaction_counts'] loop
 execute format('alter table %I enable row level security',t);
 execute format('create policy pub_read on %I for select using(true)',t);
 if t<>'reaction_counts' then execute format('create policy adm_all on %I for all using(is_admin()) with check(is_admin())',t); end if;
end loop; end $$;
alter publication supabase_realtime add table settings,ticker_items,reaction_counts;

alter table auction add column timer_len int;        -- chosen countdown length (seconds)
alter table auction add column reveal_until bigint;  -- mystery reveal runs until this time (ms); bidding opens after it
alter table auction add column prev_player_id text;  -- for "Previous player"
alter table bids add column late boolean not null default false;   -- bid placed in the last 3 seconds
insert into rules values('timer_reset_sec',10),('low_purse_pct',10) on conflict do nothing;

create function react(p_kind text) returns void language plpgsql security definer set search_path=public as $$
declare pid text;
begin
 if coalesce((select val from settings where key='reactions_on'),'1')='0' then raise exception 'Reactions are switched off'; end if;
 if p_kind not in('CHEER','WOW','SHOCK','CLAP') then raise exception 'Unknown reaction'; end if;
 select coalesce(player_id,'-') into pid from auction where id=1;
 insert into reaction_counts(id,player_id,kind,n) values(pid||':'||p_kind,pid,p_kind,1) on conflict(id) do update set n=reaction_counts.n+1;
end $$;
grant execute on function react to anon,authenticated;

-- Bid: blocked during reveal, flags last-3-second bids, resets the countdown when a bid lands in the last 3 seconds
create or replace function place_bid(p_team text,p_code text,p_bid bigint) returns json language plpgsql security definer set search_path=public as $$
declare a auction%rowtype; t teams%rowtype; pl players%rowtype; nowms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint; late boolean;
begin
 if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 if exists(select 1 from bids where team_id=p_team and at>now()-make_interval(secs=>rule('cooldown_sec',2)::double precision)) then raise exception 'Please wait a moment before bidding again'; end if;
 select * into a from auction where id=1 for update;
 if a.state<>'live' then raise exception 'Bidding is not open right now'; end if;
 if a.reveal_until is not null and nowms<a.reveal_until then raise exception 'The player is still being revealed'; end if;
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
 late:=a.timer_end is not null and a.timer_end-nowms<=3000;
 insert into bids(player_id,team_id,amount,late) values(a.player_id,p_team,p_bid,late);
 update auction set current_bid=p_bid,bid_team_id=p_team,callout=null,
  timer_end=case when timer_end is null then null when late then nowms+greatest(rule('timer_reset_sec',10),3)*1000 else timer_end end where id=1;
 return json_build_object('ok',true);
end $$;

-- SOLD must match the real current highest bid
create or replace function mark_sold(p_player text,p_team text,p_price bigint) returns json language plpgsql security definer set search_path=public as $$
declare pl players%rowtype; t teams%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.status='Sold' then return json_build_object('duplicate',true); end if;
 if exists(select 1 from auction where id=1 and player_id=p_player and state in('live','paused') and (bid_team_id is distinct from p_team or current_bid<>p_price)) then raise exception 'The sale must match the current highest bid'; end if;
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
 update auction set state='sold',current_bid=p_price,bid_team_id=p_team,callout=null,timer_end=null,reveal_until=null where id=1;
 return json_build_object('ok',true,'remaining',t.purse-t.spent-p_price,'squad',t.squad_count+1,'max',t.max_squad);
end $$;

-- Admin: undo the last bid of the live player (restores the previous bid, or the base price)
create function undo_last_bid() returns void language plpgsql security definer set search_path=public as $$
declare a auction%rowtype; b bids%rowtype; pb bids%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into a from auction where id=1 for update;
 if a.state not in('live','paused') then raise exception 'There is no live player'; end if;
 select * into b from bids where player_id=a.player_id order by id desc limit 1; if not found then raise exception 'No bids to undo'; end if;
 delete from bids where id=b.id;
 select * into pb from bids where player_id=a.player_id order by id desc limit 1;
 if found then update auction set current_bid=pb.amount,bid_team_id=pb.team_id,callout=null where id=1;
 else update auction set current_bid=(select base_price from players where id=a.player_id),bid_team_id=null,callout=null where id=1; end if;
end $$;

-- Admin: skip the live player (back to the pool, bids cleared, nothing sold)
create function skip_player() returns void language plpgsql security definer set search_path=public as $$
declare a auction%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into a from auction where id=1 for update;
 if a.player_id is null or a.state not in('live','paused') then raise exception 'There is no live player'; end if;
 delete from bids where player_id=a.player_id;
 update players set status='Available' where id=a.player_id and status='Live';
 update auction set state='idle',player_id=null,current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null,callout=null,timeout_by=null,reveal_until=null where id=1;
end $$;
revoke execute on function undo_last_bid,skip_player from public,anon;
grant execute on function undo_last_bid,skip_player to authenticated;

-- Reset (final version)
create or replace function reset_auction(p_keep boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from bids where true; delete from notifications where true; delete from predictions where true; delete from power_uses where true; delete from final_xi where true; delete from reaction_counts where true;
 if p_keep then
  delete from history where status in('Sold','Unsold');
  update players set status='Available',team_id=null,sold_price=null,sold_at=null,queue=null,base_price=coalesce(orig_base,base_price),orig_base=null,accel=false where acq is null;
  update teams t set spent=coalesce((select sum(p.sold_price) from players p where p.team_id=t.id and p.acq is not null),0),
   squad_count=(select count(*) from players p where p.team_id=t.id and p.acq is not null)::int where true;
 else
  delete from history where true;
  update players set status='Available',team_id=null,sold_price=null,sold_at=null,acq=null,queue=null,base_price=coalesce(orig_base,base_price),orig_base=null,accel=false where true;
  update teams set spent=0,squad_count=0 where true;
 end if;
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null,callout=null,timeout_by=null,reveal_until=null,timer_len=null,prev_player_id=null where id=1;
end $$;
