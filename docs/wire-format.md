# Wire Format Specification

Canonical byte-level reference for every signed binary envelope produced by
the `identity` crate (`identity/src/wire.rs` in Wavvon-server). This spec
spans three feature areas: multi-device identity (SubkeyCert, Pairing*,
RevocationEntry, HomeHubList), E2E encrypted DMs (EncryptedDmEnvelope,
GroupEncryptedEnvelope, group key distribution), and identity verification
(DhKeyRecord, PublicHubProfile, SignedPrefsBlob).

Client implementations **must** reproduce these exact byte sequences to
interoperate. The corresponding Rust test vectors live in
`identity/tests/wire_vectors.rs` in Wavvon-server; those tests assert the
exact hex produced from the fixed inputs below — the spec and the code must
stay in sync.

For the higher-level design rationale behind these envelopes see
[multi-device.md](multi-device.md) and [e2e-encryption.md](e2e-encryption.md).

---

## Primitive encoding helpers

All multi-byte integers are **little-endian**.

| Helper | Encoding |
|--------|----------|
| `write_u32_le(v)` | 4 bytes, LE |
| `write_u64_le(v)` | 8 bytes, LE |
| `write_str(s)` | `write_u32_le(len(s))` + UTF-8 bytes of `s` |
| `write_str_vec(v)` | `write_u32_le(len(v))` + each element as `write_str` |

---

## Fixed inputs for test vectors

```
master seed : 01 02 03 … 20  (bytes 1–32)
subkey seed : 21 22 23 … 40  (bytes 33–64)
timestamp   : 1_700_000_000  (0x65_53_F1_00, u64 LE = 00 f1 53 65 00 00 00 00)
```

Derived public keys (Ed25519, encoded as hex):

```
master_pub : 79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664
subkey_pub : e7f162a10bec559afea195e4dce84b69568d5d2cb0963eb446c0685e2b17f2f0
```

Derived X25519 DH public key (standard ed25519→x25519 conversion:
`SHA-512(master seed)[0..32]` → clamp → `X25519(scalar, basepoint)`):

```
master_dh_pub : 4a3807d064d077181cc070989e76891d20dca5559548dc2c77c1a50273882b38
```

Fixed inputs shared by the DM-envelope vectors below:

```
conv_id        : "conv123"
ciphertext_hex : 63697068657274657874   (hex of "ciphertext")
nonce_hex      : 0102030405060708090a0b0c
```

---

## Envelope layouts

### HomeHubList

Signed by the master key. Fields used for signature:

```
prefix       : "wavvon/home-hub-list/v1\0"   (24 bytes incl. NUL)
master_pubkey: write_str(master_pubkey_hex)
hubs         : write_str_vec(hubs)
issued_at    : write_u64_le(issued_at)
sequence     : write_u64_le(sequence)
```

**Test vector** — hubs = `["https://hub.example"]`, sequence = 1:

```
signing_bytes:
  776176766f6e2f686f6d652d6875622d6c6973742f7631004000000037396235
  3536326538666536353466393430373862313132653861393862613739303166
  3835336165363935626564376530653339313062616430343936363401000000
  1300000068747470733a2f2f6875622e6578616d706c6500f153650000000001
  00000000000000

signature (master):
  193d446382d6dde14c0d85cf3b92a13858c7daa702bf284688af0514019de566
  5dbe52be683d41f85fa004c2b0c8be329ac608dbb18a4c03e9e0fd4380db0907
```

---

### SubkeyCert

Signed by the master key. Fields used for signature:

```
prefix       : "wavvon/subkey-cert/v1\0"   (22 bytes incl. NUL)
master_pubkey: write_str(master_pubkey_hex)
subkey_pubkey: write_str(subkey_pubkey_hex)
device_label : write_str(device_label)
issued_at    : write_u64_le(issued_at)
not_after    : 0x00  if None
               0x01 + write_u64_le(t)  if Some(t)
fallback_hubs: write_str_vec(fallback_hubs)
```

**Test vector** — device_label = `"laptop"`, not_after = None, fallback_hubs = `[]`:

```
signing_bytes:
  776176766f6e2f7375626b65792d636572742f76310040000000373962353536
  3265386665363534663934303738623131326538613938626137393031663835
  3361653639356265643765306533393130626164303439363634400000006537
  6631363261313062656335353961666561313935653464636538346236393536
  3864356432636230393633656234343663303638356532623137663266300600
  00006c6170746f7000f15365000000000000000000

signature (master):
  ba99a98b72bef53d3dfc4767728806ca27cd247ecc11383453696d0011fc586e
  9eaf583c9632ff2805358dfda0de59f0cc8ca9aad33a5877be0d680b40513209
```

---

### RevocationEntry

Signed by the master key. Fields used for signature:

```
prefix       : "wavvon/revocation/v1\0"   (21 bytes incl. NUL)
master_pubkey: write_str(master_pubkey_hex)
subkey_pubkey: write_str(subkey_pubkey_hex)
revoked_at   : write_u64_le(revoked_at)
```

**Test vector** — revoked_at = `TS + 500 = 1_700_000_500`:

```
signing_bytes:
  776176766f6e2f7265766f636174696f6e2f7631004000000037396235353632
  6538666536353466393430373862313132653861393862613739303166383533
  6165363935626564376530653339313062616430343936363440000000653766
  3136326131306265633535396166656131393565346463653834623639353638
  6435643263623039363365623434366330363835653262313766326630f4f253
  6500000000

signature (master):
  6020787fb48d42085cbc7dbd8b3c78c7a4d1bcaa390baf2a9248af5d1d4b2408
  13e2775acb86820f4ec106ae3b36df01a65c1db784fc40b36f279af50e0d910d
```

---

### SignedPrefsBlob

Signed by the master key. Fields used for signature:

```
prefix       : "wavvon/prefs-blob/v1\0"   (21 bytes incl. NUL)
master_pubkey: write_str(master_pubkey_hex)
blob_version : write_u64_le(blob_version)
sha256_digest: SHA-256(ciphertext_bytes)   (32 bytes, raw)
```

Note: `ciphertext_hex` in the JSON is the hex of the raw ciphertext. The
hash is computed over the raw bytes, not the hex string.

**Test vector** — blob_version = 1, ciphertext = `"ciphertext"` (UTF-8):

```
ciphertext_hex : 63697068657274657874
signing_bytes:
  776176766f6e2f70726566732d626c6f622f7631004000000037396235353632
  6538666536353466393430373862313132653861393862613739303166383533
  6165363935626564376530653339313062616430343936363401000000000000
  00305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f9
  79

signature (master):
  7c463797b5cc76b3d8f47e6f86eff82bdbb8797bb538efcecfb8f743aed0c621
  d71d62612bd7aa750745710f0b3796ac60c8b4aefaeeb0f98883c5f47c8a1b0c
```

---

### PairingOffer

Signed by the master key. Fields used for signature:

```
prefix        : "wavvon/pairing-offer/v1\0"   (24 bytes incl. NUL)
master_pubkey : write_str(master_pubkey_hex)
home_hubs     : write_str_vec(home_hubs)
pairing_token : write_str(pairing_token)
issued_at     : write_u64_le(issued_at)
expires_at    : write_u64_le(expires_at)
```

**Test vector** — home_hubs = `["https://hub.example"]`, token = `"tok123"`,
expires_at = `TS + 300`:

```
signing_bytes:
  776176766f6e2f70616972696e672d6f666665722f7631004000000037396235
  3536326538666536353466393430373862313132653861393862613739303166
  3835336165363935626564376530653339313062616430343936363401000000
  1300000068747470733a2f2f6875622e6578616d706c6506000000746f6b3132
  3300f15365000000002cf2536500000000

signature (master):
  93add8ced681c4dda4060417ba2f7301bff6a64876d015c30fa976307edeec75
  b69ff0af42a9415a50ce605ef2c561a70d19de0820334c16054336f904ec540f
```

---

### PairingClaim

Signed by the **subkey** (new device), not the master. Fields used for signature:

```
prefix        : "wavvon/pairing-claim/v1\0"   (25 bytes incl. NUL)
pairing_token : write_str(pairing_token)
subkey_pubkey : write_str(subkey_pubkey_hex)
device_label  : write_str(device_label)
```

**Test vector** — token = `"tok123"`, device_label = `"laptop"`:

```
signing_bytes:
  776176766f6e2f70616972696e672d636c61696d2f76310006000000746f6b31
  3233400000006537663136326131306265633535396166656131393565346463
  6538346236393536386435643263623039363365623434366330363835653262
  313766326630060000006c6170746f70

proof (subkey signature):
  cea1002c8bcad922848865158e5e7b2a7241929fcb13ce4a288e52cfecf912b7
  1e2527ee0929198c2450027fb06ae04ac5f82acfffca28494feca7d253e22709
```

---

### PairingComplete

Not directly signed; it is a container that wraps a `SubkeyCert` (see above)
and an opaque `wrapped_blob_key_hex`. No separate signing bytes.

---

### DhKeyRecord

```
prefix       : "wavvon/dh-key/v1\0"   (18 bytes incl. NUL)
pubkey       : write_str(ed25519_pubkey_hex)
dh_pubkey_hex: write_str(x25519_pubkey_hex)
```

Signed by the user's Ed25519 identity key.

**Test vector** — pubkey = `master_pub`, dh_pubkey = `master_dh_pub`:

```
signing_bytes:
  776176766f6e2f64682d6b65792f763100400000003739623535363265386665
  3635346639343037386231313265386139386261373930316638353361653639
  3562656437653065333931306261643034393636344000000034613338303764
  3036346430373731383163633037303938396537363839316432306463613535
  35393534386463326337376331613530323733383832623338

signature (master):
  6fbb512c648347920f714a831b0e1b13266c60fef157fd93922092e04bb281ec
  c2918d6bd6ffce7e6602463753188fde022d04763bc30cd5d720829ddcff5603
```

---

### EncryptedDmEnvelope

Signing bytes for a 1:1 E2E encrypted DM. Signed by the **sender's**
Ed25519 identity key; the hub recomputes these bytes and verifies the
signature before storing the envelope.

```
prefix        : "wavvon/dm-ciphertext/v1\0"   (24 bytes incl. NUL)
conv_id       : write_str(conv_id)
ciphertext_hex: write_str(ciphertext_hex)
nonce_hex     : write_str(nonce_hex)
dh_pubkey_hex : write_str(dh_pubkey_hex)
```

Note: the hex fields are length-prefixed **hex strings**, not raw bytes.

**Test vector** — conv_id = `"conv123"`, dh_pubkey = `master_dh_pub`:

```
signing_bytes:
  776176766f6e2f646d2d636970686572746578742f76310007000000636f6e76
  3132331400000036333639373036383635373237343635373837341800000030
  3130323033303430353036303730383039306130623063400000003461333830
  3764303634643037373138316363303730393839653736383931643230646361
  353535393534386463326337376331613530323733383832623338

signature (master):
  6d41d6b3f9f4c5b5d87a7d819f4e9b2e1a1340c3aa97cf044037f926c63710dd
  3edeb5bc66d9dfa89fc0d9fe2a67b8a28c6c5908f42b947b3551c04dbf113709
```

---

### GroupEncryptedEnvelope

Signing bytes for a group E2E encrypted DM (sender-key scheme). Signed
by the sender's Ed25519 identity key.

```
prefix            : "wavvon/group-dm-ciphertext/v1\0"   (30 bytes incl. NUL)
conv_id           : write_str(conv_id)
sender_key_version: write_str(decimal string of u32)
iteration         : write_str(decimal string of u32)
ciphertext_hex    : write_str(ciphertext_hex)
nonce_hex         : write_str(nonce_hex)
```

Note: `sender_key_version` and `iteration` are length-prefixed
**decimal strings** (e.g. `1` → `01000000 31`), not raw integers.

**Test vector** — conv_id = `"conv123"`, sender_key_version = 1,
iteration = 2:

```
signing_bytes:
  776176766f6e2f67726f75702d646d2d636970686572746578742f7631000700
  0000636f6e763132330100000031010000003214000000363336393730363836
  3537323734363537383734180000003031303230333034303530363037303830
  39306130623063

signature (master):
  d2788d4211a7fae57b17eae2cb74b56bd8a587ee9a9a57fd1ff0f048d0a86e25
  6786bbdbc486f7754a6dac4975c2b25a2f9b0a7c73c288056e4b4938d6878b07
```

---

### Sender-key distribution (PushSenderKeyRequest)

Signing bytes for a group sender-key distribution push. Signed by the
sender's Ed25519 identity key.

```
prefix            : "wavvon/group-key-dist/v1\0"   (25 bytes incl. NUL)
conv_id           : write_str(conv_id)
sender_key_version: write_str(decimal string of u32)
per recipient     : write_str(recipient_pubkey)
                    write_str(wrapped_key_hex)
```

Recipients are sorted by `recipient_pubkey` (byte-wise ascending)
before encoding, so the signature is independent of submission order.
There is **no count prefix** before the recipient list.

**Test vector** — conv_id = `"conv123"`, sender_key_version = 1,
recipients supplied unsorted as
`[(subkey_pub, "55667788"), (master_pub, "11223344")]`
(canonical sort puts `master_pub` first):

```
signing_bytes:
  776176766f6e2f67726f75702d6b65792d646973742f76310007000000636f6e
  7631323301000000314000000037396235353632653866653635346639343037
  3862313132653861393862613739303166383533616536393562656437653065
  3339313062616430343936363408000000313132323333343440000000653766
  3136326131306265633535396166656131393565346463653834623639353638
  6435643263623039363365623434366330363835653262313766326630080000
  003535363637373838

signature (master):
  b3edd408f6a0700da3a9445be38cc6de2dcee4a927049b98e9f423e9654ee0b9
  c6adf9ff9ff4364f8ccd4f629d672b0c9cb517a0bb5b4e4de200f8a66f88fd04
```

---

### PublicHubProfile

```
prefix      : "wavvon/public-hub-profile/v1\0"   (29 bytes incl. NUL)
pubkey      : write_str(pubkey_hex)
issued_at   : write_u64_le(issued_at)
hub_count   : write_u32_le(len(public_hubs))
per hub     : write_str(hub_url)
              write_str(hub_name)
              write_u64_le(joined_at)
```

Signed by the user's Ed25519 identity key.

---

## Version bump policy

The version tag is part of the signing bytes. Any change to the field layout
**must** use a new tag (e.g. `wavvon/subkey-cert/v2\0`) so old verifiers
reject the new format cleanly. Add new vectors to
`identity/tests/wire_vectors.rs` in Wavvon-server for the new version.
