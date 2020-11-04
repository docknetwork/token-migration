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
# No of blocks to wait before treating Eth transaction as confirmed. 
ETH_TXN_CONFIRMATION_BLOCKS = 40

# Block time of Ethereum in seconds, taken from https://etherscan.io/chart/blocktime. The code assumes this will remain same during migration period.
ETH_BLOCK_TIME = 13
# Ethereum block number from where migration starts. Dummy value for now, real value will be set once migration date is finalized.
MIGRATION_START_BLOCK_NO = 100
# No of blocks corresponding to the bonus duration of 4 weeks. 4 weeks = 2419200 (4*7*24*3600) seconds and ceil(2419200/13) = 186093
BONUS_DURATION_IN_BLOCKS = 186093
# No of blocks corresponding to the migration duration. 12 weeks = 7257600 (12*7*24*3600) seconds and ceil(7257600/13) = 558277
MIGRATION_DURATION_IN_BLOCKS = 558277

DB_ENDPOINT = <For connection to db>
# Default port of Postgres
DB_PORT = 5432
DB_USER_NAME = <user name for db connection>
DB_PASS = <password for db connection>
# Database where all necessary tables will be stored
DB_NAME = token-migration

# Milliseconds to wait before trying to process pending requests, 1 min
SCHEDULER_FREQ = 60000

# Whether connecting to Dock's `main` or `test` network. This affects address validation 
DOCK_NETWORK_TYPE = test
DOCK_NODE_ENDPOINT = <RPC endpoint of node>
MIGRATOR_ADDR = <Migrator's address>
MIGRATOR_SK = <Migrator's secret URI>

# Minimum balance a migrator must have else emails will be sent
MIGRATOR_MIN_BALANCE = 1000000000
# Minimum transfers a migrator must be allowed else emails will be sent
MIGRATOR_MIN_ALLOWED = 50
# If a migrator's balance or allowed transfers go below certain point, email will be sent below
MIGRATOR_ALARM_EMAIL_FROM = <Sender of alarm email>
# Comma separaed list of alarm email recipeints.
MIGRATOR_ALARM_EMAIL_TO = <Recipeints of alarm email>
# Milliseconds to wait before sending next email
MIGRATOR_ALARM_WAIT = 900000

# AWS credentials
AWS_ACCESS_ID = <Need for sending email>
AWS_SECRET_KEY = <Need for sending email>
AWS_SES_EMAIL_REGION = <Need for sending email>
```

## Running with Infura
When using Infura as an Ethereum node, ensure methods `eth_getTransactionReceipt` and `eth_blockNumber` are whitelisted.

## Run a testing Ethereum node with deterministic seed

```
ganache-cli -d -m 'escape involve patient material anxiety carpet minor purse resist large stage human' --db ~/test_eth_node
```

## Sql to create the database and indexes
The application and tests requires the DB to be created beforehand.

**A compound primary key with transaction hash and eth address is used instead of just transaction hash as multiple calls 
might be made to the token's contract `transfer` or `transferFrom` from another contract to save fees due to txn overhead. 
But it is assumed that such a contract will not use the same `from` address more than once in a single contract call such that 
per Eth transaction one sender address is used only once** 
```
CREATE TABLE public.requests
(
    eth_address character(40) COLLATE pg_catalog."default" NOT NULL,
    eth_txn_hash character(64) COLLATE pg_catalog."default" NOT NULL,
    mainnet_address character(48) COLLATE pg_catalog."default" NOT NULL,
    signature character(130) COLLATE pg_catalog."default" NOT NULL,
    is_vesting boolean,
    status smallint NOT NULL,
    erc20 varchar(80),
    eth_txn_block_no varchar(15), 
    migration_txn_hash character(64) COLLATE pg_catalog."default",
    bonus_txn_hash character(64) COLLATE pg_catalog."default",
    migration_tokens varchar(22),
    swap_bonus_tokens varchar(22),
    vesting_bonus_tokens varchar(22),
    CONSTRAINT requests_pkey PRIMARY KEY (eth_address, eth_txn_hash)
)
TABLESPACE pg_default;

ALTER TABLE "public".requests OWNER to postgres;

CREATE INDEX Status ON "public".requests USING btree (status) TABLESPACE pg_default;
   
CREATE INDEX "IsVesting" ON "public".requests USING hash (is_vesting) TABLESPACE pg_default;

CREATE INDEX "WillGetBonus" ON "public".requests USING hash (will_get_bonus) TABLESPACE pg_default;
```

## Testing
For running integration tests using Truffle, transpile the code with Babel first using command below. That will put the 
transpiled code into `build` directory
```
yarn babel src -d build
```

Then run tests as
```
truffle test
```
