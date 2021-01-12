module.exports = {
    "plugins": ["jest", "sonarjs"],
    "env": {
        "node": true,
        "es2021": true
    },
    "extends": ["plugin:sonarjs/recommended", "eslint:recommended", "plugin:jest/recommended"],
    "parserOptions": {
        "ecmaVersion": 12,
        "sourceType": "module"
    },
    "rules": {
    }
};
