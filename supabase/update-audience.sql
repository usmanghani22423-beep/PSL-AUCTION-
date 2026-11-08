-- Run once in Supabase > SQL Editor: lets the public audience page see the live bid ticker
create policy pub_read on bids for select using(true);
