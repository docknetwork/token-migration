export const NETWORK = (() => {
    const _NETWORKS = {
        'testing_migration': 'test',
        'token-migration': 'main'
    }
    return _NETWORKS[process.env.DB_NAME] || 'test'
})();
export const DOCKNET_ADDR = (() => {
    const _ADDRS = {
        'test': "wss://danforth-1.dock.io/",
        'main': "wss://mainnet-node.dock.io/",
    }
    return _ADDRS[NETWORK] || _ADDRS['test']
})();
export const SUDO_ADDR = (() => {
    const _SUDO_ADDRS = {
        'test': '5CFfPovgr1iLJ4fekiTPmtGMyg7XGmLxUnTvd1Y4GigwPqzH',
        'main': '3HqoTXW3HBQJoFpvRaAaJoNsWTBZs3CuGRqT9xxfv497k8fs'
    }
    return _SUDO_ADDRS[NETWORK] || _SUDO_ADDRS['test']
})();

export function get_VAULT_ADDR() {
    return process.env.DOCK_ERC_20_VAULT_ADDR || '0x0cf75f808479c9e7d61c78f65e997b605160b0aa'; // eth-mainnet vault addr
}
export function get_ERC20_CONTRACT() {
    return process.env.DOCK_ERC_20_ADDR || '0xe5dada80aa6477e85d09747f2842f7993d0df71c'; // eth-mainnet contract address
}