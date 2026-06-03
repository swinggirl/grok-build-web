# grok build web

a clean, web-based interface for generating videos using the grok build backend. built for users who want to avoid the terminal while using grok build's specialized video generation protocol.

## features

- fully functional web ui (responsive on mobile)
- secure oidc login (redirects to auth.x.ai)
- no api keys stored or required
- sqlite database for persistent sessions
- rate limiting and queueing built-in (max 15 concurrent generations)

## how to host it yourself

1. make sure you have docker and docker compose installed on your machine.
2. download or clone this repository.
3. run the following command in the terminal inside the folder:
`docker compose up -d`
4. the site will be available on your local network at port 5585 (e.g., `http://localhost:5585`).