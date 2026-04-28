-- Deterministic Playwright seed data for ProjectTrading.
--
-- Before running:
-- 1. Create/confirm the auth user used by .env.test.local TEST_USER_EMAIL.
-- 2. Create/confirm these helper auth users in Supabase Auth:
--    e2e-feed-seller@example.com
--    e2e-match-user@example.com
-- 3. Replace test_email below with the exact TEST_USER_EMAIL from .env.test.local.
--
-- This script only touches the three e2e accounts named below.

create extension if not exists pgcrypto;

do $$
declare
  test_email text := 'testuser@example.com';
  feed_seller_email text := 'e2e-feed-seller@example.com';
  match_user_email text := 'e2e-match-user@example.com';

  test_user_id uuid;
  feed_seller_id uuid;
  match_user_id uuid;
  active_user_1 uuid;
  active_user_2 uuid;
  active_match_id uuid;
begin
  select id into test_user_id from auth.users where email = test_email;
  select id into feed_seller_id from auth.users where email = feed_seller_email;
  select id into match_user_id from auth.users where email = match_user_email;

  if test_user_id is null then
    raise exception 'Missing auth user for %. Edit test_email or create this user in Supabase Auth.', test_email;
  end if;
  if feed_seller_id is null then
    raise exception 'Missing helper auth user %. Create it in Supabase Auth first.', feed_seller_email;
  end if;
  if match_user_id is null then
    raise exception 'Missing helper auth user %. Create it in Supabase Auth first.', match_user_email;
  end if;

  insert into public.profiles (id, username, avatar_url, city, country_code, bio, roles, trade_rating)
  values
    (test_user_id, 'e2etest', '/pokwho-style-avatars/03-fire-newt-pup.png', 'Mumbai', 'IN', 'Dedicated Playwright test account', array['buy','sell'], 5.0),
    (feed_seller_id, 'e2efeed', '/pokwho-style-avatars/01-grass-gecko.png', 'Mumbai', 'IN', 'Visible feed seller for Playwright', array['sell'], 4.8),
    (match_user_id, 'e2ematch', '/pokwho-style-avatars/02-water-otter-frog.png', 'Dubai', 'UAE', 'Active match helper for Playwright', array['sell'], 4.7)
  on conflict (id) do update set
    username = excluded.username,
    avatar_url = excluded.avatar_url,
    city = excluded.city,
    country_code = excluded.country_code,
    bio = excluded.bio,
    roles = excluded.roles,
    trade_rating = excluded.trade_rating;

  insert into public.cards (
    id, name, set_name, set_code, card_number, rarity,
    image_url, image_url_hires, tcgplayer_id
  )
  values
    (
      '452018', 'Jynx', 'SWSH12: Silver Tempest Trainer Gallery', 'SWSH12',
      'TG04/TG30', 'Ultra Rare',
      'https://tcgplayer-cdn.tcgplayer.com/product/452018_in_200x200.jpg',
      'https://tcgplayer-cdn.tcgplayer.com/product/452018_in_1000x1000.jpg',
      '452018'
    ),
    (
      '623606', 'Brock''s Scouting', 'SV09: Journey Together', 'SV09',
      '179/159', 'Ultra Rare',
      'https://tcgplayer-cdn.tcgplayer.com/product/623606_in_200x200.jpg',
      'https://tcgplayer-cdn.tcgplayer.com/product/623606_in_1000x1000.jpg',
      '623606'
    ),
    (
      '264226', 'Rapid Strike Urshifu V', 'SWSH09: Brilliant Stars Trainer Gallery', 'SWSH09',
      'TG20/TG30', 'Ultra Rare',
      'https://tcgplayer-cdn.tcgplayer.com/product/264226_in_200x200.jpg',
      'https://tcgplayer-cdn.tcgplayer.com/product/264226_in_1000x1000.jpg',
      '264226'
    ),
    (
      '517030', 'Ninetales ex', 'SV: Scarlet and Violet 151', 'SV',
      '186/165', 'Special Illustration Rare',
      'https://tcgplayer-cdn.tcgplayer.com/product/517030_in_200x200.jpg',
      'https://tcgplayer-cdn.tcgplayer.com/product/517030_in_1000x1000.jpg',
      '517030'
    ),
    (
      '589984', 'Latias ex', 'SV08: Surging Sparks', 'SV08',
      '220/191', 'Special Illustration Rare',
      'https://tcgplayer-cdn.tcgplayer.com/product/589984_in_200x200.jpg',
      'https://tcgplayer-cdn.tcgplayer.com/product/589984_in_1000x1000.jpg',
      '589984'
    )
  on conflict (id) do update set
    name = excluded.name,
    set_name = excluded.set_name,
    set_code = excluded.set_code,
    card_number = excluded.card_number,
    rarity = excluded.rarity,
    image_url = excluded.image_url,
    image_url_hires = excluded.image_url_hires,
    tcgplayer_id = excluded.tcgplayer_id;

  insert into public.card_prices (card_id, usd_price, inr_price, aed_price, last_fetched)
  values
    ('452018', 3.08, 257, 11.30, now()),
    ('623606', 3.39, 283, 12.44, now()),
    ('264226', 6.04, 504, 22.17, now()),
    ('517030', 15.42, 1288, 56.59, now()),
    ('589984', 7.68, 641, 28.19, now())
  on conflict (card_id) do update set
    usd_price = excluded.usd_price,
    inr_price = excluded.inr_price,
    aed_price = excluded.aed_price,
    last_fetched = excluded.last_fetched;

  delete from public.messages
  where match_id in (
    select id
    from public.matches
    where
      (user_1_id = test_user_id and user_2_id in (feed_seller_id, match_user_id))
      or (user_2_id = test_user_id and user_1_id in (feed_seller_id, match_user_id))
  );

  if to_regclass('public.ratings') is not null then
    execute
      'delete from public.ratings
       where match_id in (
         select id
         from public.matches
         where
           (user_1_id = $1 and user_2_id in ($2, $3))
           or (user_2_id = $1 and user_1_id in ($2, $3))
       )'
    using test_user_id, feed_seller_id, match_user_id;
  end if;

  delete from public.matches
  where
    (user_1_id = test_user_id and user_2_id in (feed_seller_id, match_user_id))
    or (user_2_id = test_user_id and user_1_id in (feed_seller_id, match_user_id));

  delete from public.swipes
  where
    (swiper_id = test_user_id and swiped_id in (feed_seller_id, match_user_id))
    or (swiped_id = test_user_id and swiper_id in (feed_seller_id, match_user_id));

  delete from public.user_cards
  where user_id in (test_user_id, feed_seller_id, match_user_id)
    and card_id in ('452018', '623606', '264226', '517030', '589984');

  insert into public.user_cards (
    user_id, card_id, list_type, condition, is_foil, added_via,
    grading_company, grade, grade_label, added_price_usd, created_at
  )
  values
    (test_user_id, '452018', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 3.08, now() - interval '5 days'),
    (test_user_id, '623606', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 3.39, now() - interval '4 days'),
    (test_user_id, '264226', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 6.04, now() - interval '3 days'),

    (feed_seller_id, '452018', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 3.08, now() - interval '3 days'),
    (feed_seller_id, '517030', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 15.42, now() - interval '2 days'),
    (feed_seller_id, '589984', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 7.68, now() - interval '1 day'),

    (match_user_id, '517030', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 15.42, now() - interval '2 days'),
    (match_user_id, '589984', 'HAVE', 'NM', true, 'manual', 'RAW', null, null, 7.68, now() - interval '1 day');

  if test_user_id::text < match_user_id::text then
    active_user_1 := test_user_id;
    active_user_2 := match_user_id;
  else
    active_user_1 := match_user_id;
    active_user_2 := test_user_id;
  end if;

  insert into public.matches (user_1_id, user_2_id, initiated_by, status, created_at)
  values (active_user_1, active_user_2, test_user_id, 'ACTIVE', now() - interval '2 hours')
  returning id into active_match_id;

  insert into public.messages (match_id, sender_id, content, created_at, read_at)
  values
    (active_match_id, test_user_id, 'Hey, this is the seeded e2e chat.', now() - interval '90 minutes', now() - interval '89 minutes'),
    (
      active_match_id,
      match_user_id,
      '[OFFER]:{"cardId":"517030","cardName":"Ninetales ex","imageUrl":"https://tcgplayer-cdn.tcgplayer.com/product/517030_in_200x200.jpg","setName":"SV: Scarlet and Violet 151","condition":"NM","isFoil":true,"marketLocal":1288,"currency":"INR","offerAmount":1200}',
      now() - interval '20 minutes',
      null
    );
end $$;
  if test_email = 'testuser@example.com' then
    raise exception 'Edit test_email in this seed file to match TEST_USER_EMAIL from .env.test.local before running.';
  end if;
