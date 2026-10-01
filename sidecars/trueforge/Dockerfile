# TrueForge agent harness, standalone SQLite.
# Upstream: https://github.com/truefoundry/trueforge
# Pin: npm @truefoundry/trueforge@0.3.1 (bin trueforge → dist/cli.js).
# Default HOST is localhost; published ports need 0.0.0.0.
FROM node:24-slim

RUN npm install -g @truefoundry/trueforge@0.3.1

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8790 \
    STANDALONE=true \
    SQLITE_PATH=/data/db.sqlite

EXPOSE 8790

CMD ["trueforge"]
