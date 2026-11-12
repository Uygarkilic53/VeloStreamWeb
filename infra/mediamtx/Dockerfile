FROM bluenviron/mediamtx:1.12.2 AS mediamtx

FROM alpine:3.21
RUN apk add --no-cache curl ca-certificates
COPY --from=mediamtx /mediamtx /mediamtx
COPY mediamtx.yml /mediamtx.yml

EXPOSE 1935 8888 8889 8189/udp 9997
ENTRYPOINT ["/mediamtx", "/mediamtx.yml"]

