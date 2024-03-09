FROM python:3.12-alpine3.19 AS builder
RUN apk add binutils
RUN pip install --no-cache pyinstaller
RUN pip install --no-cache bottle
COPY diskchart.py /
RUN pyinstaller --onefile --name diskchart-api.bin /diskchart.py

FROM alpine:3.19
COPY --from=builder /dist/diskchart-api.bin /
RUN apk add nginx;
COPY ./diskchart.js ./chart.umd.js ./index.html /var/www/html/
COPY ./nginx.conf /etc/nginx/http.d/default.conf
COPY ./diskchart-run.sh /
RUN chmod +x /diskchart-run.sh

EXPOSE 80

CMD ["/diskchart-run.sh"]
