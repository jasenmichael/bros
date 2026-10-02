FROM obeoneorg/firecrawl-ui
USER root
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY bros-default-api.js /usr/share/nginx/html/bros-default-api.js
RUN sed -i 's|<head>|<head>\n    <script src="/bros-default-api.js"></script>|' /usr/share/nginx/html/index.html \
  && grep -q bros-default-api.js /usr/share/nginx/html/index.html
USER nginx
