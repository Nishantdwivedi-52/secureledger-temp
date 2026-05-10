# schema.md

```text
## Node: Account
  id               (string)  -- hashed account ID via hash_id()
  bank             (string)  -- bank ID from CSV
  anomaly_score    (float)   -- set by Day 3
  fraud_prob       (float)   -- set by Day 4
  pagerank_score   (float)   -- set by Day 5
  betweenness      (float)   -- set by Day 5
  mastermind_score (float)   -- set by Day 5
  community_id     (int)     -- set by Day 5
  propagated_risk  (float)   -- set by Day 4

## Relationship: TRANSACTION
  amount_paid     (float)
  amount_received (float)
  pay_currency    (string)
  recv_currency   (string)
  payment_format  (string)
  timestamp       (string -- ISO format)
  is_laundering   (int -- 0 or 1)
