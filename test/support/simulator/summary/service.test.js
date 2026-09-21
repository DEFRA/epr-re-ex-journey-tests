import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { viewThrough } from './service.js'

/** What the service answers each path with, as the summary reads it. */
const answers = new Map([
  [
    '/v1/organisations/org-1',
    {
      submittedToRegulator: 'ea',
      registrations: [
        {
          wasteProcessingType: 'reprocessor',
          material: 'glass',
          glassRecyclingProcess: ['glass_other'],
          accreditationId: 'acc-1',
          site: { address: { postcode: 'RG4 5AA' } }
        },
        { wasteProcessingType: 'exporter', material: 'paper' }
      ],
      accreditations: [
        { status: 'approved', prnIssuance: { tonnageBand: 'up_to_5000' } }
      ]
    }
  ],
  [
    '/v1/organisations/org-1/registrations/reg-1/summary-logs',
    {
      summaryLogs: [
        { uploadedAt: '2026-02-03T10:00:00.000Z', status: 'submitted' },
        { uploadedAt: '2026-02-04T10:00:00.000Z', status: 'invalid' }
      ]
    }
  ],
  [
    '/v1/organisations/org-1/registrations/reg-2/summary-logs',
    { summaryLogs: [] }
  ],
  [
    '/v1/organisations/reports/submissions',
    {
      generatedAt: '2026-05-22T09:00:00.000Z',
      reportSubmissions: [
        {
          registrationNumber: 'R26EA1',
          reportType: 'Monthly',
          reportingPeriod: 'Jan 2026',
          submittedDate: '2026-02-19',
          submissionNumber: 1
        },
        {
          registrationNumber: 'R26EA1',
          reportType: 'Monthly',
          reportingPeriod: 'Feb 2026',
          submittedDate: '',
          submissionNumber: ''
        }
      ]
    }
  ],
  [
    '/v1/admin/packaging-recycling-notes?statuses=draft,awaiting_authorisation,awaiting_acceptance,accepted,awaiting_cancellation,cancelled,deleted,discarded&limit=1000',
    {
      items: [{ accreditationNumber: '1', createdAt: '2026-03-02T09:00:00Z' }],
      hasMore: true,
      nextCursor: 'page-2'
    }
  ],
  [
    '/v1/admin/packaging-recycling-notes?statuses=draft,awaiting_authorisation,awaiting_acceptance,accepted,awaiting_cancellation,cancelled,deleted,discarded&limit=1000&cursor=page-2',
    {
      items: [{ accreditationNumber: '1', createdAt: '2026-03-03T09:00:00Z' }],
      hasMore: false
    }
  ],
  [
    '/v1/system-logs/search?subCategory=packaging-recycling-notes&limit=200',
    {
      systemLogs: [
        {
          createdAt: '2026-03-04T09:00:00Z',
          context: {
            previous: { status: { currentStatus: 'draft' } },
            next: {
              status: { currentStatus: 'awaiting_authorisation' },
              accreditation: { accreditationNumber: '1' }
            }
          }
        }
      ],
      hasNext: false
    }
  ]
])

/** @param {string} path */
const get = (path) => {
  const answer = answers.get(path)
  assert.ok(answer, `unexpected path ${path}`)
  return Promise.resolve(answer)
}

const held = [
  {
    refNo: 'org-1',
    registrations: [
      { registrationId: 'reg-1', planned: { id: 'OP-0001-R1' } },
      { registrationId: 'reg-2', planned: { id: 'OP-0001-R2' } }
    ]
  }
]

describe('viewThrough', () => {
  it('puts what the service holds into the plan’s vocabulary, page by page', async () => {
    const view = await viewThrough(held, get)
    assert.deepEqual(view.organisations, [
      {
        type: 'both',
        agency: 'EA',
        registrations: [
          {
            processingType: 'reprocessor',
            material: 'GO',
            accredited: true,
            sitePostcode: 'RG4 5AA'
          },
          {
            processingType: 'exporter',
            material: 'PA',
            accredited: false,
            sitePostcode: null
          }
        ],
        accreditations: [
          { status: 'approved', tonnageBand: 'Up to 5,000 tonnes' }
        ]
      }
    ])
    assert.deepEqual(view.summaryLogs, [
      {
        registrationId: 'OP-0001-R1',
        uploadedAt: '2026-02-03T10:00:00.000Z',
        status: 'submitted'
      },
      {
        registrationId: 'OP-0001-R1',
        uploadedAt: '2026-02-04T10:00:00.000Z',
        status: 'invalid'
      }
    ])
    assert.equal(view.feedYear, '2026')
    assert.deepEqual(view.reports, [
      {
        registrationNumber: 'R26EA1',
        reportType: 'Monthly',
        reportingPeriod: 'Jan 2026',
        submittedDate: '2026-02-19',
        submissionNumber: 1
      },
      {
        registrationNumber: 'R26EA1',
        reportType: 'Monthly',
        reportingPeriod: 'Feb 2026',
        submittedDate: null,
        submissionNumber: null
      }
    ])
    assert.deepEqual(
      view.notes.map((note) => note.createdAt),
      ['2026-03-02T09:00:00Z', '2026-03-03T09:00:00Z']
    )
    assert.deepEqual(view.noteTransitions, [
      {
        accreditationNumber: '1',
        at: '2026-03-04T09:00:00Z',
        from: 'draft',
        to: 'awaiting_authorisation'
      }
    ])
  })

  it('refuses a material the register has no suffix for', async () => {
    const unknown = new Map(answers)
    unknown.set('/v1/organisations/org-1', {
      submittedToRegulator: 'ea',
      registrations: [{ wasteProcessingType: 'exporter', material: 'rubber' }],
      accreditations: []
    })
    await assert.rejects(
      viewThrough(held, (path) => Promise.resolve(unknown.get(path))),
      /"rubber"/
    )
  })
})
