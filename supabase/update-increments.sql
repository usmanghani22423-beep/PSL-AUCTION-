-- Run once in Supabase > SQL Editor: official-style minimum incremental bids
-- under 1.1 Cr: 2.5 lakh | 1.1 Cr to under 2.2 Cr: 5 lakh | 2.2 Cr to under 4.2 Cr: 10 lakh | 4.2 Cr and above: 15 lakh
delete from bid_rules where true;
insert into bid_rules(min_price,step) values (0,250000),(11000000,500000),(22000000,1000000),(42000000,1500000);
