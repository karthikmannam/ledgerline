import { Router } from 'express';

type OpenApiObject = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name: string) => ({ $ref: `#/components/responses/${name}` });
const jsonResponse = (description: string, schema: OpenApiObject) => ({
  description,
  content: { 'application/json': { schema } }
});
const requestBody = (schema: string, description = 'Request payload', required = true) => ({
  required,
  description,
  content: { 'application/json': { schema: ref(schema) } }
});

function operation(
  summary: string,
  responses: Record<string, OpenApiObject>,
  options: {
    auth?: boolean;
    csrf?: boolean;
    body?: string;
    bodyRequired?: boolean;
    description?: string;
    parameters?: OpenApiObject[];
  } = {}
): OpenApiObject {
  const allResponses: Record<string, OpenApiObject> = { ...responses, '500': responseRef('InternalError') };
  if (options.auth) allResponses['401'] = responseRef('Unauthorized');
  return {
    summary,
    ...(options.description ? { description: options.description } : {}),
    ...(options.auth ? { security: [{ sessionCookie: [] }] } : {}),
    ...(options.csrf ? { parameters: [{ $ref: '#/components/parameters/CsrfToken' }, ...(options.parameters ?? [])] } : options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: requestBody(options.body, 'Request payload', options.bodyRequired ?? true) } : {}),
    responses: allResponses
  };
}

const idParameter: OpenApiObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' }
};

const limitParameter = (maximum: number, defaultValue: number): OpenApiObject => ({
  name: 'limit',
  in: 'query',
  schema: { type: 'integer', minimum: 1, maximum, default: defaultValue }
});

export const openapi: OpenApiObject = {
  openapi: '3.0.3',
  info: {
    title: 'LedgerLine API',
    version: '1.0.0',
    description:
      'Cookie-authenticated double-entry ledger API. Monetary amounts are integer paise represented as decimal strings in responses; send integer paise strings in requests to avoid floating-point rounding. Authenticated POST, PATCH, PUT, and DELETE requests require the x-csrf-token header. Browser clients must send credentials.'
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Accounts' },
    { name: 'Deposits' },
    { name: 'Money movement' },
    { name: 'Transactions' },
    { name: 'Adjustments' },
    { name: 'Audit' }
  ],
  paths: {
    '/health': {
      get: operation('Check service health', {
        '200': jsonResponse('Service is alive', ref('Health'))
      }, { auth: false })
    },
    '/health/live': {
      get: operation('Check process liveness', {
        '200': jsonResponse('Process is alive', ref('Health'))
      }, { auth: false })
    },
    '/health/ready': {
      get: operation('Check database readiness', {
        '200': jsonResponse('Service and database are ready', ref('Health')),
        '503': jsonResponse('Database is unavailable', ref('Error'))
      }, { auth: false })
    },
    '/openapi.json': {
      get: operation('Get this API specification', {
        '200': jsonResponse('OpenAPI document', { type: 'object' })
      }, { auth: false })
    },
    '/auth/register': {
      post: operation('Register a holder account', {
        '201': jsonResponse('User created', ref('IdResult')),
        '400': responseRef('BadRequest'),
        '409': jsonResponse('Email is already registered', ref('Error'))
      }, { auth: false, body: 'RegisterRequest', description: 'Registration does not create an authenticated session.' })
    },
    '/auth/login': {
      post: operation('Log in and create a session', {
        '200': jsonResponse('Authenticated user; session and CSRF cookies are set', ref('LoginResult')),
        '400': responseRef('BadRequest'),
        '401': jsonResponse('Credentials are invalid', ref('Error')),
        '403': jsonResponse('User is inactive', ref('Error')),
        '429': jsonResponse('Login attempts are rate limited', ref('Error'))
      }, { auth: false, body: 'LoginRequest' })
    },
    '/auth/me': {
      get: operation('Get the current user and session', {
        '200': jsonResponse('Current session identity', ref('CurrentUser'))
      }, { auth: true })
    },
    '/auth/logout': {
      post: operation('Revoke the current session', {
        '200': jsonResponse('Session revoked and cookies cleared', ref('OkResult')),
        '403': responseRef('Forbidden')
      }, { auth: true, csrf: true })
    },
    '/accounts': {
      get: operation('List accounts visible to the current user', {
        '200': jsonResponse('Visible customer accounts', { type: 'object', required: ['accounts'], properties: { accounts: { type: 'array', items: ref('Account') } } })
      }, { auth: true }),
      post: operation('Create a customer account', {
        '201': jsonResponse('Account created', ref('IdResult')),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden')
      }, { auth: true, csrf: true, body: 'CreateAccountRequest' })
    },
    '/accounts/{id}': {
      get: operation('Get an account', {
        '200': jsonResponse('Account details', ref('Account')),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound')
      }, { auth: true, parameters: [idParameter] })
    },
    '/accounts/{id}/status': {
      patch: operation('Update account status', {
        '200': jsonResponse('Account status updated', { type: 'object', required: ['id', 'status'], properties: { id: { type: 'string' }, status: { type: 'string', enum: ['active', 'suspended'] } } }),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound')
      }, { auth: true, csrf: true, body: 'AccountStatusRequest', parameters: [idParameter] })
    },
    '/accounts/{id}/suspend': {
      post: operation('Suspend an account', {
        '200': jsonResponse('Account suspended', ref('OkResult')),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound')
      }, { auth: true, csrf: true, parameters: [idParameter] })
    },
    '/accounts/{id}/permission': {
      post: operation('Grant an account permission', {
        '200': jsonResponse('Permission granted', ref('OkResult')),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden')
      }, { auth: true, csrf: true, body: 'AccountPermissionRequest', parameters: [idParameter] })
    },
    '/accounts/{id}/statement': {
      get: operation('Read a paginated account statement', {
        '200': jsonResponse('Statement page', ref('Statement')),
        '403': responseRef('Forbidden')
      }, {
        auth: true,
        parameters: [
          idParameter,
          limitParameter(200, 50),
          { name: 'before', in: 'query', description: 'Exclusive activity sequence cursor returned as nextBefore.', schema: { type: 'string', pattern: '^\\d+$' } },
          { name: 'hw', in: 'query', description: 'Reuse the response highWater value to keep subsequent pages on a stable snapshot.', schema: { type: 'string', pattern: '^\\d+$' } }
        ]
      })
    },
    '/deposit-requests': {
      get: operation('List deposit requests visible to the current user', {
        '200': jsonResponse('Deposit requests', { type: 'object', required: ['deposits'], properties: { deposits: { type: 'array', items: ref('Deposit') } } })
      }, { auth: true, parameters: [limitParameter(500, 100)] }),
      post: operation('Request a deposit', {
        '201': jsonResponse('Deposit request created', ref('IdResult')),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound'),
        '409': jsonResponse('External reference already used', ref('Error'))
      }, { auth: true, csrf: true, body: 'CreateDepositRequest' })
    },
    '/deposit-requests/{id}/verify-and-post': {
      post: operation('Verify and post a deposit', {
        '200': jsonResponse('Deposit posted to the ledger', ref('PostedBalance')),
        '403': jsonResponse('Maker-checker restriction', ref('Error')),
        '404': responseRef('NotFound'),
        '409': jsonResponse('Deposit was already reviewed or its reference is duplicated', ref('Error'))
      }, { auth: true, csrf: true, parameters: [idParameter], description: 'Admin only. The checker must differ from the maker and from the account holder.' })
    },
    '/withdrawals': {
      post: operation('Withdraw from an account', {
        '200': jsonResponse('Withdrawal posted; idempotent replays return the original result', ref('WithdrawalResult')),
        '400': jsonResponse('Invalid request or inactive account', ref('Error')),
        '403': responseRef('Forbidden'),
        '409': jsonResponse('Idempotency key was reused with a different payload', ref('Error')),
        '422': jsonResponse('Insufficient funds', ref('Error'))
      }, { auth: true, csrf: true, body: 'WithdrawalRequest', description: 'The idempotency key is scoped to the authenticated actor. Repeating the same key and payload replays the original status and response.' })
    },
    '/transfers': {
      post: operation('Transfer between accounts', {
        '200': jsonResponse('Transfer posted; idempotent replays return the original result', ref('TransferResult')),
        '400': jsonResponse('Invalid request or inactive account', ref('Error')),
        '403': responseRef('Forbidden'),
        '409': jsonResponse('Idempotency key was reused with a different payload', ref('Error')),
        '422': jsonResponse('Insufficient funds', ref('Error'))
      }, { auth: true, csrf: true, body: 'TransferRequest', description: 'The idempotency key is scoped to the authenticated actor. Repeating the same key and payload replays the original status and response.' })
    },
    '/transactions/{id}': {
      get: operation('Get a ledger transaction and its postings', {
        '200': jsonResponse('Transaction details', ref('Transaction')),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound')
      }, { auth: true, parameters: [idParameter] })
    },
    '/transactions/{id}/reverse': {
      post: operation('Reverse a transaction', {
        '200': jsonResponse('Compensating reversal created', { type: 'object', required: ['reversal'], properties: { reversal: { type: 'string' } } }),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden'),
        '404': responseRef('NotFound'),
        '409': jsonResponse('Transaction cannot be reversed or is already reversed', ref('Error')),
        '422': jsonResponse('Reversal would cause insufficient funds', ref('Error'))
      }, { auth: true, csrf: true, body: 'ReverseTransactionRequest', bodyRequired: false, parameters: [idParameter], description: 'Admin only. Reversals append compensating ledger entries; original postings are never edited.' })
    },
    '/adjustments': {
      post: operation('Request an administrative adjustment', {
        '201': jsonResponse('Adjustment request created', ref('IdResult')),
        '400': responseRef('BadRequest'),
        '403': responseRef('Forbidden'),
        '409': jsonResponse('Reference already used', ref('Error'))
      }, { auth: true, csrf: true, body: 'CreateAdjustmentRequest', description: 'Admin only. Approval requires a different admin.' })
    },
    '/adjustments/{id}/approve': {
      post: operation('Approve an adjustment request', {
        '200': jsonResponse('Adjustment posted', ref('PostedBalance')),
        '403': jsonResponse('Maker-checker restriction', ref('Error')),
        '404': responseRef('NotFound'),
        '409': jsonResponse('Adjustment was already reviewed', ref('Error')),
        '422': jsonResponse('Adjustment would overdraw the account', ref('Error'))
      }, { auth: true, csrf: true, parameters: [idParameter], description: 'Admin only. The approver must differ from the requesting admin.' })
    },
    '/audit/events': {
      get: operation('List audit events', {
        '200': jsonResponse('Audit events', { type: 'object', required: ['events'], properties: { events: { type: 'array', items: { type: 'object', additionalProperties: true } } } }),
        '403': responseRef('Forbidden')
      }, { auth: true, parameters: [limitParameter(500, 100)], description: 'Admin and auditor only.' })
    },
    '/audit/attempts': {
      get: operation('List recorded refused attempts', {
        '200': jsonResponse('Refused attempts', { type: 'object', required: ['attempts'], properties: { attempts: { type: 'array', items: { type: 'object', additionalProperties: true } } } }),
        '403': responseRef('Forbidden')
      }, { auth: true, description: 'Admin and auditor only. Returns up to 200 most recent attempts.' })
    },
    '/audit/reconciliation': {
      get: operation('Reconcile ledger postings and balance projections', {
        '200': jsonResponse('Reconciliation result', ref('Reconciliation')),
        '403': responseRef('Forbidden')
      }, { auth: true, description: 'Admin and auditor only. Read-only; discrepancies are reported, never silently corrected.' })
    }
  },
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'ledgerline_session', description: 'Opaque server-side session cookie set by POST /auth/login.' }
    },
    parameters: {
      CsrfToken: {
        name: 'x-csrf-token',
        in: 'header',
        required: true,
        description: 'CSRF token paired with the ledgerline_csrf cookie, set by POST /auth/login.',
        schema: { type: 'string' }
      }
    },
    responses: {
      BadRequest: jsonResponse('Request validation failed', ref('Error')),
      Unauthorized: jsonResponse('Missing or invalid session', ref('Error')),
      Forbidden: jsonResponse('Insufficient role, permission, or CSRF token', ref('Error')),
      NotFound: jsonResponse('Resource not found', ref('Error')),
      InternalError: jsonResponse('Unexpected server error', ref('Error'))
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: { code: { type: 'string' }, message: { type: 'string' } }
          }
        }
      },
      Health: { type: 'object', required: ['status', 'service'], properties: { status: { type: 'string', enum: ['ok'] }, service: { type: 'string', example: 'ledgerline-api' } } },
      IdResult: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      OkResult: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } },
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email', maxLength: 254 }, password: { type: 'string', minLength: 10, maxLength: 128 } }
      },
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 1, maxLength: 128 } } },
      LoginResult: { type: 'object', required: ['id', 'role'], properties: { id: { type: 'string' }, role: { type: 'string', enum: ['holder', 'admin', 'auditor'] } } },
      CurrentUser: { type: 'object', required: ['id', 'email', 'role', 'isActive', 'sessionId'], properties: { id: { type: 'string' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['holder', 'admin', 'auditor'] }, isActive: { type: 'boolean' }, sessionId: { type: 'string' } } },
      MoneyAmount: {
        description: 'Positive integer paise. String input is recommended to avoid JavaScript floating-point rounding.',
        oneOf: [{ type: 'string', pattern: '^[1-9][0-9]*$', example: '100000' }, { type: 'number', minimum: 1, multipleOf: 1 }]
      },
      MoneyBalance: { type: 'string', pattern: '^(0|[1-9][0-9]*)$', description: 'Non-negative integer paise.' },
      Account: { type: 'object', required: ['id', 'name', 'status', 'currency', 'balance'], properties: { id: { type: 'string' }, name: { type: 'string' }, status: { type: 'string', enum: ['active', 'suspended'] }, currency: { type: 'string', example: 'INR' }, balance: ref('MoneyBalance') } },
      CreateAccountRequest: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 120 } } },
      AccountStatusRequest: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'suspended'] } } },
      AccountPermissionRequest: { type: 'object', required: ['user_id', 'permission'], properties: { user_id: { type: 'string', format: 'uuid' }, permission: { type: 'string', enum: ['view', 'withdraw', 'transfer_out'] } } },
      Statement: {
        type: 'object',
        required: ['account', 'highWater', 'nextBefore', 'entries'],
        properties: {
          account: { type: 'string' },
          highWater: { type: 'string', description: 'Activity sequence ceiling for consistent pagination.' },
          nextBefore: { type: 'string', nullable: true },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              required: ['seq', 'transaction', 'type', 'amount', 'side', 'runningBalance', 'actor', 'at'],
              properties: {
                seq: { type: 'string' }, transaction: { type: 'string', nullable: true }, type: { type: 'string', nullable: true },
                amount: ref('MoneyBalance'), side: { type: 'string', enum: ['debit', 'credit'] }, runningBalance: ref('MoneyBalance'),
                actor: { type: 'string', nullable: true }, at: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      },
      CreateDepositRequest: {
        type: 'object',
        required: ['accountId', 'amount', 'externalReference'],
        properties: { accountId: { type: 'string', format: 'uuid' }, amount: ref('MoneyAmount'), externalReference: { type: 'string', minLength: 1, maxLength: 200 }, evidence: { type: 'object', additionalProperties: true } }
      },
      Deposit: { type: 'object', required: ['id', 'accountId', 'amount', 'externalReference', 'status', 'makerId', 'checkerId', 'createdAt'], properties: { id: { type: 'string' }, accountId: { type: 'string' }, amount: ref('MoneyBalance'), externalReference: { type: 'string' }, status: { type: 'string', enum: ['pending', 'verified', 'rejected'] }, makerId: { type: 'string', nullable: true }, checkerId: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' } } },
      PostedBalance: { type: 'object', required: ['transaction', 'balance'], properties: { transaction: { type: 'string' }, balance: ref('MoneyBalance') } },
      IdempotentRequest: {
        type: 'object',
        required: ['idempotencyKey', 'amount'],
        properties: { idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 }, amount: ref('MoneyAmount'), currency: { type: 'string', enum: ['INR'], default: 'INR' } }
      },
      WithdrawalRequest: { allOf: [ref('IdempotentRequest'), { type: 'object', required: ['accountId'], properties: { accountId: { type: 'string', format: 'uuid' } } }] },
      TransferRequest: { allOf: [ref('IdempotentRequest'), { type: 'object', required: ['fromAccountId', 'toAccountId'], properties: { fromAccountId: { type: 'string', format: 'uuid' }, toAccountId: { type: 'string', format: 'uuid' } } }] },
      WithdrawalResult: { type: 'object', required: ['transaction', 'balance', 'currency'], properties: { transaction: { type: 'string' }, balance: ref('MoneyBalance'), currency: { type: 'string', enum: ['INR'] } } },
      TransferResult: { type: 'object', required: ['transaction', 'fromBalance', 'toBalance', 'currency'], properties: { transaction: { type: 'string' }, fromBalance: ref('MoneyBalance'), toBalance: ref('MoneyBalance'), currency: { type: 'string', enum: ['INR'] } } },
      Transaction: { type: 'object', required: ['id', 'type', 'status', 'reversalOf', 'postings'], properties: { id: { type: 'string' }, type: { type: 'string' }, status: { type: 'string' }, reversalOf: { type: 'string', nullable: true }, postings: { type: 'array', items: { type: 'object', required: ['account', 'side', 'amount'], properties: { account: { type: 'string' }, side: { type: 'string', enum: ['debit', 'credit'] }, amount: ref('MoneyBalance') } } } } },
      ReverseTransactionRequest: { type: 'object', properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } } },
      CreateAdjustmentRequest: { type: 'object', required: ['accountId', 'direction', 'amount', 'reason', 'reference'], properties: { accountId: { type: 'string', format: 'uuid' }, direction: { type: 'string', enum: ['credit', 'debit'] }, amount: ref('MoneyAmount'), reason: { type: 'string', minLength: 1, maxLength: 500 }, reference: { type: 'string', minLength: 1, maxLength: 200 } } },
      Reconciliation: { type: 'object', required: ['balanced', 'discrepancies', 'integrityOk'], properties: { balanced: { type: 'boolean' }, discrepancies: { type: 'array', items: { type: 'object', required: ['account', 'expected', 'projected'], properties: { account: { type: 'string' }, expected: { type: 'string' }, projected: { type: 'string' } } } }, integrityOk: { type: 'boolean' } } }
    }
  }
};

export const openapiRouter = Router();
openapiRouter.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});
