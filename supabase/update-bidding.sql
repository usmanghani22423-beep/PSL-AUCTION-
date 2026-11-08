-- Run once in Supabase > SQL Editor (after schema.sql)
create table team_codes(team_id text primary key references teams on delete cascade,code text not null);
alter table team_codes enable row level security;
create policy adm_all on team_codes for all using(is_admin()) with check(is_admin());

create function generate_codes() returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 insert into team_codes(team_id,code) select id,upper(substr(md5(random()::text||clock_timestamp()::text||id),1,8)) from teams
 on conflict(team_id) do update set code=excluded.code; end $$;

create function check_team(p_team text,p_code text) returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from team_codes where team_id=p_team and code=upper(p_code)) $$;

-- Team bid: server checks code, auction open, timer, price, purse, squad. Row lock makes simultaneous bids safe (second one is rejected).
create function place_bid(p_team text,p_code text,p_bid bigint) returns json language plpgsql security definer set search_path=public as $$
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
 update auction set current_bid=p_bid,bid_team_id=p_team,timer_end=greatest(coalesce(timer_end,0),nowms+10000) where id=1;
 return json_build_object('ok',true);
end $$;
revoke execute on function generate_codes from public,anon; grant execute on function generate_codes to authenticated;
grant execute on function check_team,place_bid to anon,authenticated;
