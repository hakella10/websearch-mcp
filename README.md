# A Simple websearch-mcp using SSE.

It is implemented as MCP via StreambleHttpTransport using express.
It uses headless chromium browser from playwright, content parsing with cheerio against brave search.
It consists of a Single tool web-search: {query, numResults}

# How to start:

Load chromium browser for playwright. 

`npx playwright install --with-deps chromium`

Run NodeJS project.

`npm run start`

# How to start docker:

`docker build -t websearch .`

`docker run -itd -p 9000:9000 --name webmcp websearch`

`docker logs webmcp`

# How to access:

http://<localhost:9000>/mcp
PORT can be overridden using the env variable API_PORT. Defaults to 9000
