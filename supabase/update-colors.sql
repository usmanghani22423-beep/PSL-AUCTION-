-- Run once in Supabase > SQL Editor: sets every team to its default PSL colour (you can change them later from admin > Teams)
update teams set color=case id when 't1' then '#0877C9' when 't2' then '#087A48' when 't3' then '#E32636' when 't4' then '#F5C518'
 when 't5' then '#673AB7' when 't6' then '#087F83' when 't7' then '#E87524' when 't8' then '#C65A32' else color end;
