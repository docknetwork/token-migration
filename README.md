# Token migration API

The API requires a connection to Postgres DB as defined below. Also requires HTTP/S access to Ethereum node through Infura or otherwise.

## Env variables
Change below variables according to your setup
```
API_LISTEN_ADDRESS = 127.0.0.1
API_PORT = 3000
ETH_NODE_ENDPOINT = <HTTP/S endpoint to connect to Ethereum node, can be from Infura>
# Address of Dock's ERC-20 contract
DOCK_ERC_20_ADDR = 0xe5dada80aa6477e85d09747f2842f7993d0df71c
DOCK_ERC_20_VAULT_ADDR = <Dock's vault address>
DB_ENDPOINT = <For connection to db>
# Default port of Postgres
DB_PORT = 5432
DB_USER_NAME = <user name for db connection>
DB_PASS = <password for db connection>
# Database where all necessary tables will be stored
DB_NAME = token-migration
# Whether connecting to Dock's `main` or `test` network. This affects address validation 
DOCK_NETWORK_TYPE = test
# 1 min
SCHEDULER_FREQ = 60000
DOCK_NODE_ENDPOINT = <RPC endpoint of node>
MIGRATOR_ADDR = <Migrator's address>
MIGRATOR_SK = <Migrator's secret URI>
```

## Running with Infura
When using Infura as an Ethereum node, ensure methods `eth_getTransactionReceipt` and `eth_blockNumber` are whitelisted.

## Run a testing Ethereum node with deterministic seed

```
ganache-cli -d -m 'escape involve patient material anxiety carpet minor purse resist large stage human' --db ~/test_eth_node
```

## Sql to create the database and indexes
The application and test requires the DB to be created beforehand.  
_A compound primary key might not be needed and eth txn hash could be the pk. Ensure that single transaction could not have multiple transfers._ 
```
CREATE TABLE public.requests
(
    eth_address character(40) COLLATE pg_catalog."default" NOT NULL,
    eth_txn_hash character(64) COLLATE pg_catalog."default" NOT NULL,
    mainnet_address character(48) COLLATE pg_catalog."default" NOT NULL,
    status smallint NOT NULL,
    erc20 varchar(80),
    mainnet_txn_hash character(64) COLLATE pg_catalog."default",
    mainnet_tokens_given varchar(22),
    signature character(130) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT requests_pkey PRIMARY KEY (eth_address, eth_txn_hash)
)

TABLESPACE pg_default;

ALTER TABLE "public".requests
    OWNER to postgres;

CREATE INDEX "Status"
    ON "public".requests USING btree
    (status ASC NULLS LAST)
    INCLUDE(status)
    TABLESPACE pg_default;
```