-- Run once in Supabase > SQL Editor (after update-bidding.sql)
create table bids(id bigserial primary key,player_id text,team_id text,amount bigint,at timestamptz default now());
alter table bids enable row level security;
create policy adm_all on bids for all using(is_admin()) with check(is_admin());
alter publication supabase_realtime add table bids;

create or replace function place_bid(p_team text,p_code text,p_bid bigint) returns json language plpgsql security definer set search_path=public as $$
declare a auction%rowtype; t teams%rowtype; pl players%rowtype; nowms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
begin
 if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 select * into a from auction where id=1 for update;
 if a.state<>'live' then raise exception 'Bidding is not open right now'; end if;
 if a.timer_end is not null and nowms>a.timer_end then raise exception 'Time is up'; end if;
 if a.bid_team_id=p_team then raise exception 'You already hold the highest bid'; end if;
 select * into pl from players where id=a.player_id;
 if p_bid<pl.base_price then raise exception 'Below base price'; end if;
 if a.bid_team_id is not null and p_bid<=a.current_bid then raise exception 'Too late – price is now %',a.current_bid; end if;
 if a.bid_team_id is null and p_bid<a.current_bid then raise exception 'Bid too low'; end if;
 select * into t from teams where id=p_team for update;
 if t.spent+p_bid>t.purse then raise exception 'Not enough purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad is full'; end if;
 insert into bids(player_id,team_id,amount) values(a.player_id,p_team,p_bid);
 update auction set current_bid=p_bid,bid_team_id=p_team,timer_end=greatest(coalesce(timer_end,0),nowms+10000) where id=1;
 return json_build_object('ok',true);
end $$;

create or replace function reset_auction() returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from history where true; delete from notifications where true; delete from bids where true;
 update players set status='Available',team_id=null,sold_price=null,sold_at=null where true;
 update teams set spent=0,squad_count=0 where true;
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null where id=1; end $$;
