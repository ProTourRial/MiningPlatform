# Domain Event Versioning Policy

Owner: Abia Nugrahanto

1. Event name bersifat immutable, contoh `mining.share.upstream-accepted.v1`.
2. Penambahan field optional yang backward-compatible tidak menaikkan major event version.
3. Perubahan arti field, penghapusan field, atau perubahan tipe membuat event `.v2`.
4. Producer boleh dual-publish selama migration window.
5. Consumer wajib menolak versi yang tidak dikenali.
6. Event lama disimpan selama retention dan tidak ditulis ulang.
7. Setiap event memiliki owner context, schema, contoh payload, data classification, dan idempotency key.
8. Credential secret dan data kriptografi privat dilarang pada event.
