# App estático (HTML + JS inline). Sem build — apenas servir via nginx.
FROM nginx:alpine

# Configuração do servidor
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Arquivos estáticos do PWA
COPY index.html manifest.json icon.svg sw.js /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
