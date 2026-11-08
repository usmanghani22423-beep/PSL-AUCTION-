-- Run once in Supabase > SQL Editor (after the previous update files)
alter table players add column acq text;                       -- null = bought at auction, else 'Retention' / 'Direct signing'
insert into teams(id,name,purse,max_squad) values('t7','Rawalpindiz',500000000,20),('t8','Hyderabad Kingsmen',500000000,20) on conflict do nothing;
update teams set purse=500000000 where true;                    -- 50 crore each
insert into team_contacts(team_id) select id from teams on conflict do nothing;

drop function if exists generate_codes();
create function generate_codes(p_all boolean default false) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 insert into team_codes(team_id,code) select id,upper(substr(md5(random()::text||clock_timestamp()::text||id),1,8)) from teams
 on conflict(team_id) do update set code=case when p_all then excluded.code else team_codes.code end; end $$;

create function assign_player(p_player text,p_team text,p_type text,p_price bigint default 0) returns json language plpgsql security definer set search_path=public as $$
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
 update teams set spent=spent+p_price,squad_count=squad_count+1 where id=p_team;
 update players set status='Sold',team_id=p_team,sold_price=p_price,sold_at=now(),acq=p_type where id=p_player;
 insert into history(player_id,name,team_id,team,price,status) values(p_player,pl.name,p_team,t.name,p_price,p_type)
  on conflict(player_id) do update set team_id=excluded.team_id,team=excluded.team,price=excluded.price,status=excluded.status,at=now();
 return json_build_object('ok',true);
end $$;

create function unassign_player(p_player text) returns void language plpgsql security definer set search_path=public as $$
declare pl players%rowtype;
begin
 if not is_admin() then raise exception 'Not an admin'; end if;
 select * into pl from players where id=p_player for update; if not found then raise exception 'Player not found'; end if;
 if pl.acq is null then raise exception 'Not a retention / direct signing player'; end if;
 update teams set spent=spent-coalesce(pl.sold_price,0),squad_count=squad_count-1 where id=pl.team_id;
 update players set status='Available',team_id=null,sold_price=null,sold_at=null,acq=null where id=p_player;
 delete from history where player_id=p_player;
end $$;

-- Reset: p_keep=true restarts the auction but keeps retentions & direct signings; false wipes everything
drop function if exists reset_auction();
create function reset_auction(p_keep boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from bids where true; delete from notifications where true;
 if p_keep then
  delete from history where status in('Sold','Unsold');
  update players set status='Available',team_id=null,sold_price=null,sold_at=null where acq is null;
  update teams t set spent=coalesce((select sum(p.sold_price) from players p where p.team_id=t.id and p.acq is not null),0),
   squad_count=(select count(*) from players p where p.team_id=t.id and p.acq is not null)::int where true;
 else
  delete from history where true;
  update players set status='Available',team_id=null,sold_price=null,sold_at=null,acq=null where true;
  update teams set spent=0,squad_count=0 where true;
 end if;
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null where id=1;
end $$;

revoke execute on function generate_codes,assign_player,unassign_player,reset_auction from public,anon;
grant execute on function generate_codes,assign_player,unassign_player,reset_auction to authenticated;
