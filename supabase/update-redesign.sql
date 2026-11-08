-- Run once in Supabase > SQL Editor (after update-fun.sql)
alter table teams add column owner text;                                     -- shown on the team dashboard (edit in admin > Teams)
update teams set name='Rawalpindi Pindiz' where id='t7' and name='Rawalpindiz';
update teams set color=case id when 't1' then '#0877C9' when 't2' then '#087A48' when 't3' then '#E32636' when 't4' then '#F5C518'
 when 't5' then '#673AB7' when 't6' then '#087F83' when 't7' then '#E87524' when 't8' then '#C65A32' else color end;
