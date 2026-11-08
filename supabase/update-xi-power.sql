-- Run once in Supabase > SQL Editor (after update-accelerated.sql)
-- Adds: Playing XI picker, Time-out power card, auction "complete" finale support
insert into rules values('timeouts_per_team',1) on conflict do nothing;
alter table auction add column timeout_by text;

create table final_xi(team_id text primary key references teams on delete cascade,player_ids text[] not null default '{}',captain text,updated_at timestamptz default now());
alter table final_xi enable row level security;
create policy pub_read on final_xi for select using(true);
create policy adm_all on final_xi for all using(is_admin()) with check(is_admin());
alter publication supabase_realtime add table final_xi;

create table power_uses(id bigserial primary key,team_id text,kind text,at timestamptz default now());
alter table power_uses enable row level security;
create policy adm_all on power_uses for all using(is_admin()) with check(is_admin());

create function save_xi(p_team text,p_code text,p_ids text[],p_captain text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 if coalesce(array_length(p_ids,1),0)>11 then raise exception 'A Playing XI has at most 11 players'; end if;
 if exists(select 1 from unnest(coalesce(p_ids,'{}'::text[])) x where not exists(select 1 from players where id=x and team_id=p_team and status='Sold')) then raise exception 'You can only pick your own players'; end if;
 if coalesce(p_captain,'')<>'' and not (p_captain=any(coalesce(p_ids,'{}'::text[]))) then raise exception 'The captain must be in the XI'; end if;
 insert into final_xi(team_id,player_ids,captain,updated_at) values(p_team,coalesce(p_ids,'{}'::text[]),nullif(p_captain,''),now())
 on conflict(team_id) do update set player_ids=excluded.player_ids,captain=excluded.captain,updated_at=now();
end $$;

create function power_left(p_team text,p_code text) returns int language plpgsql security definer set search_path=public as $$
begin if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 return greatest(0,rule('timeouts_per_team',1)::int-(select count(*) from power_uses where team_id=p_team and kind='timeout')::int); end $$;

create function use_timeout(p_team text,p_code text) returns void language plpgsql security definer set search_path=public as $$
declare a auction%rowtype; nowms bigint:=(extract(epoch from clock_timestamp())*1000)::bigint;
begin
 if not check_team(p_team,p_code) then raise exception 'Invalid team link'; end if;
 select * into a from auction where id=1 for update;
 if a.state<>'live' then raise exception 'A time-out can only be called while bidding is live'; end if;
 if power_left(p_team,p_code)<=0 then raise exception 'No time-outs left'; end if;
 insert into power_uses(team_id,kind) values(p_team,'timeout');
 update auction set state='paused',timeout_by=p_team,callout=null,remaining_ms=case when timer_end is null then null else greatest(0,timer_end-nowms) end where id=1;
end $$;
grant execute on function save_xi,power_left,use_timeout to anon,authenticated;

-- Reset (final version: also clears time-outs, XI picks and restores base prices)
create or replace function reset_auction(p_keep boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from bids where true; delete from notifications where true; delete from predictions where true; delete from power_uses where true; delete from final_xi where true;
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
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null,callout=null,timeout_by=null where id=1;
end $$;
