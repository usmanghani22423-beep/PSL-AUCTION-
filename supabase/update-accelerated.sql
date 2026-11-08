-- Run once in Supabase > SQL Editor (after update-increments.sql)
alter table players add column accel boolean not null default false;   -- true = playing in the accelerated round
alter table players add column orig_base bigint;                        -- base price before it was reduced

-- Accelerated round: every UNSOLD player returns with a reduced base price (4.2->2.2, 2.2->1.1, 1.1->0.6 Cr; 0.6 stays)
create function accelerated_round() returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin if not is_admin() then raise exception 'Not an admin'; end if;
 update players set orig_base=coalesce(orig_base,base_price),
  base_price=case when base_price>=42000000 then 22000000 when base_price>=22000000 then 11000000 when base_price>=11000000 then 6000000 else base_price end,
  status='Available',accel=true,queue=null where status='Unsold';
 get diagnostics n=row_count;
 delete from history where status='Unsold';
 if n>0 then update announcement set text='⚡ Accelerated round! Unsold players are back with reduced base prices.',updated_at=now() where id=1; end if;
 return n;
end $$;
revoke execute on function accelerated_round from public,anon;
grant execute on function accelerated_round to authenticated;

-- Reset also restores original base prices
create or replace function reset_auction(p_keep boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'Not an admin'; end if;
 delete from bids where true; delete from notifications where true; delete from predictions where true;
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
 update auction set player_id=null,state='idle',current_bid=0,bid_team_id=null,timer_end=null,remaining_ms=null,callout=null where id=1;
end $$;
