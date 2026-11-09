# Split Madi

A small, self-hosted app to share trip and household expenses with friends and family. Each person
deploys their own copy on Vercel, with a free Neon Postgres database.

## Features

- Create a group and add people by email. Each person gets a personal invite link.
- A link works only with the email it was made for. After that, the browser stays signed in.
  There is no password.
- Add an expense and split it equally, or by parts (for example 3/2/1 of 6 parts).
- Set a base currency for the group. New expenses use it by default. An expense in another currency
  gets today's reference rate, and you can change the rate.
- "Settle up" shows the fewest payments that clear all debts. "Mark paid" records a payment.
- Add people without an email, such as children or grandparents. They are part of the split, but
  they cannot sign in.

## Security model

- Only the admin can create groups. The admin signs in at `/admin` with the email in `ADMIN_EMAIL`
  and a password. The app keeps only a scrypt hash of the password, in `ADMIN_PASSWORD_HASH`.
- After 5 failed sign-ins from one IP address, that address must wait 15 minutes.
- An admin sign-in lasts 30 days, or until "Leave admin" or "Sign out".
- Each member has a personal invite link with a 122-bit random token (a v4 UUID). The plain group URL shows
  only "this group is private".
- To use an invite link, the visitor must type the email that the member was added with.
- A browser session holds the members it proved, not an email. Typing someone's email on the home
  page does not give access to their groups.
- Other members see a person's invite link only until that person joins. After that, only the
  person sees it ("Copy my link"), to sign in on another device.
- "New link" replaces the link of someone who has not joined yet. The old link stops working.
- Emails are not verified by a code. A person who has both a link and the matching email gets in.
  Send each link only to its owner.

## Deploy on Vercel

1. Push this repository to your GitHub account.
2. On Vercel, select **Add New > Project** and import the repository. Do not deploy yet if Vercel
   asks; you can also deploy now and redeploy after step 4.
3. Open the project, go to **Storage**, select **Create Database**, and pick **Neon** (free plan).
4. Connect the database to the project for all environments. Vercel adds `DATABASE_URL`.
5. Set the admin. `npm run hash-password` asks for a password (12 characters or more) and prints
   its hash. Add `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` to the project environment.
6. Redeploy. The app creates its tables on the first request. Sign in at `/admin` to create groups.

With the Vercel CLI, steps 2 to 6 are:

```sh
npm i -g vercel
vercel link
vercel integration add neon
vercel env add ADMIN_EMAIL --environment production --value 'you@example.com'
HASH="$(npm run -s hash-password)" && vercel env add ADMIN_PASSWORD_HASH --environment production --sensitive --value "$HASH" && unset HASH
vercel env pull .env.local
vercel deploy --prod
```

The hash goes from the script into a shell variable, so it does not show on the screen. Do not pipe
the script into `vercel env add`: the CLI waits only 500 ms for piped input and saves an empty value.
To change the password, run the second line again with `--force`, then redeploy.

## Run locally

You do not need Docker. The local database is PGlite, which is Postgres in WebAssembly.

```sh
npm install
cp .env.example .env.local
npm run db:local   # terminal 1: Postgres on 127.0.0.1:54329, data in .pglite/
npm run dev        # terminal 2: http://localhost:3000
```

To use a real Postgres, set `DATABASE_URL` in `.env.local` to its connection string.

## Tests

```sh
npm test          # unit tests, plus database tests on an in-memory PGlite
npm run typecheck
npm run lint
```

## How the money works

- All amounts are integers in minor units (paise, cents). There are no floating-point totals.
- A foreign-currency expense keeps its original amount and rate. Splits and balances use the
  amount converted into the base currency.
- A split gives each person `floor(total × parts / all parts)`. The leftover minor units go to the
  people with the largest remainders, so the parts always add up to the total.
- You can change the base currency only before the first expense or payment.

## Stack

Next.js 16 (App Router, Server Actions, Cache Components), Tailwind CSS 4, `pg`, and Postgres.
