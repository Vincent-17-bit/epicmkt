#!/bin/sh
(while sleep 300; do nginx -s reload; done) >/dev/null 2>&1 &
