import globals from 'globals';
import js from '@eslint/js';

export default [
    // dev-only tooling (Node scripts) - not part of the browser bundle
    { ignores : ['node_modules/**', 'scripts/**', 'backend/**'] },
    js.configs.recommended,
    {
        languageOptions : {
            globals : {
                ...globals.browser,
                ...globals.mocha,
            },
            ecmaVersion : 2018,
            sourceType : 'module'
        },

        rules : {
            'no-unused-vars' : ['error', { caughtErrors : 'none' }],
            indent : ['error', 4, { SwitchCase : 1 }],
            'linebreak-style' : ['error', 'unix'],
            quotes : ['error', 'single'],
            semi : ['error', 'always'],
            'key-spacing' : ['error', { beforeColon : true, afterColon : true }],
            'no-trailing-spaces' : ['error', { skipBlankLines : false, ignoreComments : true }],
            'no-multiple-empty-lines' : ['error', { max : 1, maxEOF : 0 }],
            'no-console' : 'error'
        }
    }
];
