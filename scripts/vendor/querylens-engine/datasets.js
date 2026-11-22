import { createSeedDatabase } from "./seed.js";
export const DEFAULT_DATASET = 'users';
export const DATASET_IDS = ['users', 'orders', 'logins', 'employees', 'transactions', 'customers'];
export function isDatasetId(value) {
    return typeof value === 'string' && DATASET_IDS.includes(value);
}
const ORDER_CUSTOMERS = [
    'acme', 'globex', 'initech', 'umbrella', 'soylent', 'hooli', 'stark', 'wayne',
    'wonka', 'tyrell', 'cyberdyne', 'aperture',
];
const ORDER_STATUS = ['paid', 'pending', 'refunded'];
function orderRows() {
    return Array.from({ length: 120 }, (_, i) => ({
        id: i + 1,
        customer: ORDER_CUSTOMERS[i % ORDER_CUSTOMERS.length],
        total: 50 + ((i * 37) % 950),
        status: ORDER_STATUS[i % 3],
    }));
}
const LOGIN_USERS = [
    'ada', 'brendan', 'carmack', 'dijkstra', 'grace', 'guido', 'hopper', 'ken',
    'knuth', 'lamport', 'linus', 'matz', 'radia', 'ritchie', 'turing', 'yukihiro',
];
function loginRows() {
    return Array.from({ length: 80 }, (_, i) => {
        // 1 in 9 is blocked — the deliberate skew: `status = 'blocked'` is a
        // handful of rows after a full scan, `status = 'ok'` is nearly all of them.
        const blocked = i % 9 === 0;
        return {
            id: i + 1,
            user: LOGIN_USERS[i % LOGIN_USERS.length],
            status: blocked ? 'blocked' : 'ok',
            attempts: blocked ? 3 + (i % 5) : 1,
        };
    });
}
const DEPARTMENTS = [
    'engineering', 'sales', 'marketing', 'support', 'finance', 'legal', 'design', 'product',
    'people', 'security', 'data', 'research', 'platform', 'growth', 'success', 'partnerships',
    'operations', 'recruiting', 'it', 'facilities', 'compliance', 'strategy', 'brand',
    'localization', 'devrel',
];
const EMPLOYEES_PER_DEPARTMENT = 10;
/**
 * `department` and `office` are perfectly correlated: every department occupies exactly one office, the way a real
 * team often does. That is exactly the independence assumption `AND` selectivity makes (plan.md §25.4 C2), and
 * exactly what `ANALYZE`'s own per-column statistics (plan.md §25.4 C1) cannot see — nothing there counts how two
 * columns co-occur, only how each behaves alone: `department = 'sales' AND office = 'building-2'` is no narrower
 * than `department = 'sales'` by itself, since office adds no information at all, but the optimizer's multiplied
 * fractions assume it does — badly underestimating (RESEARCH.md §41: Leis et al. found real optimizers off by an
 * order of magnitude or more from exactly this).
 */
function employeeRows() {
    return DEPARTMENTS.flatMap((department, d) => Array.from({ length: EMPLOYEES_PER_DEPARTMENT }, (_, i) => ({
        id: d * EMPLOYEES_PER_DEPARTMENT + i + 1,
        department,
        office: `building-${String(d + 1)}`,
        salary: 60000 + ((d * EMPLOYEES_PER_DEPARTMENT + i) * 733) % 80000,
    })));
}
const TRANSACTION_COUNT = 3000;
const TRANSACTION_ACCOUNTS = Array.from({ length: 40 }, (_, i) => `acct-${String(i + 1).padStart(2, '0')}`);
/**
 * 3,000 rows: a genuinely taller B+Tree than any other preset (height 7, measured against `id` with this
 * engine's real `maxKeys = 4` — `employees`'s 250 rows only reaches height 5) and 750 heap pages against the
 * default 8 buffer frames, so a scan that touches most of the table evicts hard enough to be dramatic, not
 * token. `amount` is deliberately unindexed and spans the whole table uniformly, so `amount > 4500` (~10%
 * selectivity) still has to read every one of those 750 pages — `account` is likewise unindexed, 40 repeating
 * values, for the same "an equality still costs a full scan" point a bigger table makes more vivid. Sized by a
 * throwaway probe script measuring the real `height()`/heap-page count across 500–10,000 rows, not estimated
 * (plan.md's own "measure, don't guess") — 3,000 was the smallest size that still reached height 7.
 */
function transactionRows() {
    return Array.from({ length: TRANSACTION_COUNT }, (_, i) => ({
        id: i + 1,
        account: TRANSACTION_ACCOUNTS[i % TRANSACTION_ACCOUNTS.length],
        amount: 10 + ((i * 97) % 4990),
        status: i % 5 === 0 ? 'failed' : 'settled',
    }));
}
/**
 * 20 customers, written out by hand so each NULL is placed on purpose (plan.md §26 Feature 3). Five have no `city`
 * on record, so `city = 'Paris'` and `city <> 'Paris'` together still miss five rows. `referrer` is the id of the
 * customer who brought them in, NULL for the eight who came on their own — so `id NOT IN (SELECT referrer …)`,
 * "who referred nobody", meets a NULL in its list and returns nothing. `discount` is NULL for seven, and 0 for one:
 * `COUNT(discount)` counts the 0 and not the NULLs, and `AVG(discount)` averages only the thirteen that have one.
 */
const CUSTOMER_ROWS = [
    { id: 1, name: 'ana', city: 'Paris', referrer: null, discount: 10 },
    { id: 2, name: 'ben', city: 'Lagos', referrer: 1, discount: null },
    { id: 3, name: 'chen', city: 'Lima', referrer: 1, discount: 5 },
    { id: 4, name: 'dara', city: null, referrer: 2, discount: null },
    { id: 5, name: 'eli', city: 'Osaka', referrer: null, discount: 15 },
    { id: 6, name: 'fay', city: 'Paris', referrer: 3, discount: null },
    { id: 7, name: 'gus', city: null, referrer: null, discount: 5 },
    { id: 8, name: 'hana', city: 'Lima', referrer: 5, discount: 20 },
    { id: 9, name: 'ivo', city: 'Lagos', referrer: 5, discount: null },
    { id: 10, name: 'jun', city: 'Osaka', referrer: null, discount: 10 },
    { id: 11, name: 'kai', city: null, referrer: 8, discount: null },
    { id: 12, name: 'lea', city: 'Paris', referrer: 8, discount: 0 },
    { id: 13, name: 'max', city: 'Lima', referrer: null, discount: null },
    { id: 14, name: 'nia', city: 'Osaka', referrer: 10, discount: 5 },
    { id: 15, name: 'omar', city: null, referrer: null, discount: 10 },
    { id: 16, name: 'pia', city: 'Lagos', referrer: 12, discount: 15 },
    { id: 17, name: 'quin', city: 'Paris', referrer: null, discount: 25 },
    { id: 18, name: 'rosa', city: 'Lima', referrer: 14, discount: 5 },
    { id: 19, name: 'sam', city: null, referrer: null, discount: null },
    { id: 20, name: 'tara', city: 'Osaka', referrer: 16, discount: 10 },
];
export const DATASETS = {
    customers: {
        id: 'customers',
        table: 'customers',
        make: () => ({
            tables: {
                customers: {
                    name: 'customers',
                    columns: ['id', 'name', 'city', 'referrer', 'discount'],
                    rows: CUSTOMER_ROWS.map((r) => ({ ...r })),
                    indexedColumns: ['id'],
                },
            },
        }),
    },
    users: { id: 'users', table: 'users', make: createSeedDatabase },
    transactions: {
        id: 'transactions',
        table: 'transactions',
        make: () => ({
            tables: {
                transactions: {
                    name: 'transactions',
                    columns: ['id', 'account', 'amount', 'status'],
                    rows: transactionRows(),
                    indexedColumns: ['id'],
                },
            },
        }),
    },
    employees: {
        id: 'employees',
        table: 'employees',
        make: () => ({
            tables: {
                employees: {
                    name: 'employees',
                    columns: ['id', 'department', 'office', 'salary'],
                    rows: employeeRows(),
                    indexedColumns: ['id'],
                },
            },
        }),
    },
    orders: {
        id: 'orders',
        table: 'orders',
        make: () => ({
            tables: {
                orders: {
                    name: 'orders',
                    columns: ['id', 'customer', 'total', 'status'],
                    rows: orderRows(),
                    indexedColumns: ['id'],
                },
            },
        }),
    },
    logins: {
        id: 'logins',
        table: 'logins',
        make: () => ({
            tables: {
                logins: {
                    name: 'logins',
                    columns: ['id', 'user', 'status', 'attempts'],
                    rows: loginRows(),
                    indexedColumns: ['id'],
                },
            },
        }),
    },
};
