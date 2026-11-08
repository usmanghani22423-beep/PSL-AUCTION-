-- Run once in Supabase > SQL Editor (after update-audience.sql)
alter table players add column queue int;                      -- auction order (null = not queued)
create table bid_rules(min_price bigint primary key,step bigint not null check(step>0));
insert into bid_rules values(0,2500000),(50000000,5000000),(100000000,10000000);   -- 25 lakh / 50 lakh / 1 crore raises
alter table bid_rules enable row level security;
create policy pub_read on bid_rules for select using(true);
create policy adm_all on bid_rules for all using(is_admin()) with check(is_admin());
alter publication supabase_realtime add table bid_rules;

create function bid_step(p bigint) returns bigint language sql stable set search_path=public as $$
 select coalesce((select step from bid_rules where min_price<=p order by min_price desc limit 1),2500000) $$;

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
 if a.bid_team_id is null and p_bid<a.current_bid then raise exception 'Bid too low'; end if;
 if a.bid_team_id is not null and p_bid<a.current_bid+bid_step(a.current_bid) then raise exception 'Minimum bid is %',a.current_bid+bid_step(a.current_bid); end if;
 select * into t from teams where id=p_team for update;
 if t.spent+p_bid>t.purse then raise exception 'Not enough purse'; end if;
 if t.squad_count>=t.max_squad then raise exception 'Squad is full'; end if;
 insert into bids(player_id,team_id,amount) values(a.player_id,p_team,p_bid);
 update auction set current_bid=p_bid,bid_team_id=p_team,timer_end=case when timer_end is null then null else greatest(timer_end,nowms+10000) end where id=1;
 return json_build_object('ok',true);
end $$;

create function queue_add(p_ids text[]) returns void language plpgsql security definer set search_path=public as $$
declare m int;
begin if not is_admin() then raise exception 'Not an admin'; end if;
 select coalesce(max(queue),0) into m from players;
 update players p set queue=m+x.n from unnest(p_ids) with ordinality as x(id,n) where p.id=x.id and p.queue is null and p.status in('Available','Upcoming'); end $$;

create function queue_clear() returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if; update players set queue=null where queue is not null; end $$;

create function requeue_unsold() returns void language plpgsql security definer set search_path=public as $$
declare m int;
begin if not is_admin() then raise exception 'Not an admin'; end if;
 select coalesce(max(queue),0) into m from players;
 update players p set status='Available',queue=m+x.n from (select id,row_number() over(order by id) n from players where status='Unsold') x where p.id=x.id;
 delete from history where status='Unsold'; end $$;

create function undo_sale(p_player text) returns void language plpgsql security definer set search_path=public as $$
declare pl players%rowtype;
begin if not is_admin() then raise exception 'Not an admin'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.status<>'Sold' then raise exception 'Player is not sold'; end if;
 if pl.acq is not null then raise exception 'Use Remove for retention / direct signing'; end if;
 update teams set spent=spent-coalesce(pl.sold_price,0),squad_count=squad_count-1 where id=pl.team_id;
 update players set status='Available',team_id=null,sold_price=null,sold_at=null where id=p_player;
 delete from history where player_id=p_player; delete from notifications where player_id=p_player; delete from bids where player_id=p_player;
 update auction set state='idle',player_id=null,current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null where id=1 and player_id=p_player; end $$;

create function set_images(p_data jsonb) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 update players p set image=x.image from jsonb_to_recordset(p_data) as x(id text,image text) where p.id=x.id; end $$;

revoke execute on function queue_add,queue_clear,requeue_unsold,undo_sale,set_images from public,anon;
grant execute on function queue_add,queue_clear,requeue_unsold,undo_sale,set_images to authenticated;
