-- Run once in Supabase > SQL Editor (after update-rules.sql)
alter table teams add column color text;
update teams set color=case id when 't1' then '#1565c0' when 't2' then '#2e7d32' when 't3' then '#c62828' when 't4' then '#f9a825'
 when 't5' then '#6a1b9a' when 't6' then '#00838f' when 't7' then '#ef6c00' when 't8' then '#5d4037' else '#01a35c' end;
alter table announcement add column starts_at timestamptz;

create table predictions(player_id text,voter text,name text,team_id text,primary key(player_id,voter));
alter table predictions enable row level security;   -- no policies: only the functions/views below can touch it
create view prediction_counts as select player_id,team_id,count(*)::int as n from predictions group by player_id,team_id;
create view prediction_board as select pr.voter,max(pr.name) as name,
 (count(*) filter(where p.status='Sold' and pr.team_id=p.team_id))::int as correct,(count(*) filter(where p.status='Sold'))::int as total
 from predictions pr join players p on p.id=pr.player_id group by pr.voter;
grant select on prediction_counts,prediction_board to anon,authenticated;

create function predict(p_player text,p_team text,p_voter text,p_name text) returns void language plpgsql security definer set search_path=public as $$
declare a auction%rowtype;
begin
 select * into a from auction where id=1;
 if a.state<>'live' or a.player_id is distinct from p_player then raise exception 'Voting is closed for this player'; end if;
 if not exists(select 1 from teams where id=p_team) then raise exception 'Unknown team'; end if;
 if length(coalesce(p_voter,''))<8 or length(p_voter)>60 then raise exception 'Bad voter id'; end if;
 insert into predictions(player_id,voter,name,team_id) values(p_player,p_voter,left(coalesce(nullif(trim(p_name),''),'Guest'),20),p_team)
 on conflict(player_id,voter) do update set team_id=excluded.team_id,name=excluded.name;
end $$;
grant execute on function predict to anon,authenticated;

create or replace function reset_auction(p_keep boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from bids where true; delete from notifications where true; delete from predictions where true;
 if p_keep then
  delete from history where status in('Sold','Unsold');
  update players set status='Available',team_id=null,sold_price=null,sold_at=null,queue=null where acq is null;
  update teams t set spent=coalesce((select sum(p.sold_price) from players p where p.team_id=t.id and p.acq is not null),0),
   squad_count=(select count(*) from players p where p.team_id=t.id and p.acq is not null)::int where true;
 else
  delete from history where true;
  update players set status='Available',team_id=null,sold_price=null,sold_at=null,acq=null,queue=null where true;
  update teams set spent=0,squad_count=0 where true;
 end if;
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null,callout=null where id=1;
end $$;
