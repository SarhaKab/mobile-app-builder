\set ON_ERROR_STOP 0
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','client@t','{"full_name":"Ana","lang":"es","role":"admin"}'),
 ('00000000-0000-0000-0000-00000000000b','coach@t','{"full_name":"Beto"}'),
 ('00000000-0000-0000-0000-00000000000c','other@t','{"full_name":"Carla"}'),
 ('00000000-0000-0000-0000-00000000000d','admin@t','{"full_name":"Dana"}');
update users set role='admin' where id='00000000-0000-0000-0000-00000000000d';
\echo T1 metadata role ignored (expect client/es)
select role, lang from users where id='00000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo T2 self-escalation (expect ERROR)
update users set role='admin' where id=auth.uid();
\echo T3 sees only self (expect 1)
select count(*) from users;
\echo T4 health data without consent (expect ERROR)
insert into client_health_data (user_id, allergies) values (auth.uid(), '{nuts}');
insert into consents (user_id,purpose,version,granted) values (auth.uid(),'health_data','v1',true);
\echo T5 with consent (expect INSERT 0 1)
insert into client_health_data (user_id, allergies) values (auth.uid(), '{nuts}');
\echo T6 client cannot write payments (expect ERROR rls)
insert into payments (user_id, booking_id, amount_cents, currency, provider) values (auth.uid(), null, 1, 'USD', 'x');
\echo T7 client cannot enable flag (expect UPDATE 0)
update feature_flags set enabled=true where key='kfit_club';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo T8 coach registration (expect registration_in_progress)
select start_coach_registration('mx-tulum');
\echo T9 rate above cap (expect ERROR)
update coach_profiles set hourly_rate_cents=2500 where user_id=auth.uid();
\echo T10 rate ok, currency auto (expect 1800 USD)
update coach_profiles set hourly_rate_cents=1800, specialties='{yoga}' where user_id=auth.uid() returning hourly_rate_cents, currency;
\echo T11 self-approve (expect ERROR)
update coach_profiles set status='approved' where user_id=auth.uid();
\echo T12 submit for review (expect UPDATE 1)
update coach_profiles set status='under_review' where user_id=auth.uid();
\echo T13 coach cannot read client health (expect 0)
select count(*) from client_health_data;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo T14 unapproved coach invisible to client (expect 0)
select count(*) from coach_profiles;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
\echo T15 admin approves (expect UPDATE 1)
update coach_profiles set status='approved', verified_at=now(), verified_by=auth.uid() where user_id='00000000-0000-0000-0000-00000000000b';
\echo T16 activate coach plan without legal ref (expect ERROR check)
update subscription_plans set is_active=true where audience='coach';
\echo T17 activate commission without legal ref (expect ERROR check)
update platform_fees set is_active=true;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo T18 client sees approved coach (expect 1) and creates request
select count(*) from coach_profiles;
insert into service_requests (id, client_id, market_code, starts_at, duration_minutes, specialty)
 values ('10000000-0000-0000-0000-000000000001', auth.uid(), 'mx-tulum', now()+interval '2 days', 90, 'yoga');
insert into service_requests (id, client_id, market_code, starts_at, duration_minutes)
 values ('10000000-0000-0000-0000-000000000002', auth.uid(), 'mx-tulum', now()+interval '2 days 30 minutes', 60);
reset role;
insert into mission_offers (id, request_id, coach_id) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
\echo T19 third party cannot answer offer (expect ERROR) nor see requests (0)
select respond_to_offer('20000000-0000-0000-0000-000000000001', true);
select count(*) from service_requests;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
\echo T20 coach accepts (booking id), price 2700
select respond_to_offer('20000000-0000-0000-0000-000000000001', true) is not null as booked;
select session_price_cents, hourly_rate_cents, status from bookings;
\echo T21 overlapping second accept (expect ERROR exclusion)
select respond_to_offer('20000000-0000-0000-0000-000000000002', true);
\echo T22 decline is neutral (expect null; profile unchanged)
select respond_to_offer('20000000-0000-0000-0000-000000000002', false);
select rating_avg, rating_count, sessions_completed, status from coach_profiles where user_id=auth.uid();
\echo T23 rate change not retroactive (booking stays 1800)
update coach_profiles set hourly_rate_cents=1000 where user_id=auth.uid();
select hourly_rate_cents, session_price_cents from bookings;
\echo T24 coach cannot edit booking price (expect UPDATE 0)
update bookings set session_price_cents=99999;
\echo T25 session flow
select confirm_session(id,'start') from bookings;
select confirm_session(id,'end') from bookings;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
\echo T26 review before completion (expect ERROR)
insert into reviews (booking_id, client_id, coach_id, rating) select id, auth.uid(), coach_id, 5 from bookings;
select confirm_session(id,'start') from bookings;
select confirm_session(id,'end') from bookings;
select status from bookings;
\echo T27 review after completion; rating 5/1, sessions 1
insert into reviews (booking_id, client_id, coach_id, rating) select id, auth.uid(), coach_id, 5 from bookings;
select rating_avg, rating_count, sessions_completed from coach_profiles;
\echo T28 client sees coach name via shared booking (expect 2 users)
select count(*) from users;
\echo T29 audit not visible to client (0), visible to admin (>0)
select count(*) from audit_logs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select count(*) > 0 as admin_sees_audit from audit_logs;
select count(*) as work_records from work_time_records;
reset role;
\echo T30 tables without RLS (expect 0)
select count(*) from pg_tables where schemaname='public' and not rowsecurity;
select count(*) as tables from pg_tables where schemaname='public';
