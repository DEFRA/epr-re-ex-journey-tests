import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MATERIALS } from '../../materials.js'
import {
  applicationRow,
  nationLetter,
  numbersFor,
  regulatorOf,
  reprocessingTypeOf,
  seededProcessingType,
  siteAddress
} from './join.js'

/** @import {PlannedRegistration} from '../population/population.js' */

/** @param {string} suffix */
const material = (suffix) => {
  const found = MATERIALS.find((entry) => entry.suffix === suffix)
  assert.ok(found)
  return found
}
const paper = material('PA')
const glass = material('GO')

/**
 * @param {Partial<PlannedRegistration>} overrides
 * @returns {PlannedRegistration}
 */
const registration = (overrides = {}) => ({
  id: 'OP-0001-R1',
  organisationId: 'OP-0001',
  agency: 'EA',
  nation: 'England',
  processingType: 'reprocessor',
  material: paper,
  siteId: 'OP-0001-S1',
  status: 'approved',
  activeFrom: '2026-01-01',
  accreditation: {
    status: 'approved',
    tonnageBand: 'Up to 5,000 tonnes',
    validFrom: '2026-01-01',
    validTo: '2026-12-31'
  },
  ...overrides
})

describe('nation', () => {
  it('is the letter the register spells it with', () => {
    assert.equal(nationLetter('England'), 'E')
    assert.equal(nationLetter('Wales'), 'W')
    assert.equal(nationLetter('Scotland'), 'S')
    assert.equal(nationLetter('Northern Ireland'), 'N')
  })

  it('refuses a nation the register does not spell', () => {
    assert.throws(() => nationLetter('Cornwall'), /Cornwall/)
  })

  it('files the operator under its agency as the service spells it', () => {
    assert.equal(regulatorOf({ agency: 'NIEA' }), 'niea')
  })
})

describe('site address', () => {
  it('is a well-formed address the same planned site always gets', () => {
    const address = siteAddress('OP-0001-S1')
    assert.match(address.street, /^\d{1,3} [A-Z][a-z]+ [A-Z][a-z]+$/)
    assert.match(address.town, /^[A-Z][a-z]+/)
    assert.deepEqual(siteAddress('OP-0001-S1'), address)
  })

  it('is a postcode the Royal Mail could have issued', () => {
    for (let site = 1; site <= 200; site++) {
      assert.match(
        siteAddress(`OP-${site}-S1`).postcode,
        /^[A-PR-UWYZ][A-HK-Y]\d{1,2} \d[ABD-HJLNP-UW-Z]{2}$/
      )
    }
  })

  it("keys differently between an operator's sites", () => {
    assert.notEqual(
      siteAddress('OP-0001-S1').postcode,
      siteAddress('OP-0001-S2').postcode
    )
  })
})

describe('processing type', () => {
  it('is what the seeders call it', () => {
    assert.equal(
      seededProcessingType(registration({ processingType: 'exporter' })),
      'Exporter'
    )
    assert.equal(seededProcessingType(registration()), 'Reprocessor')
  })

  it('reads input or output off the stream a reprocessor files on', () => {
    assert.equal(reprocessingTypeOf('reprocessorInput'), 'input')
    assert.equal(reprocessingTypeOf('reprocessorOutput'), 'output')
    assert.equal(reprocessingTypeOf('regOnlyReprocessor'), 'input')
  })

  it('gives an exporter none, which the service forbids it to have', () => {
    assert.equal(reprocessingTypeOf('exporter'), undefined)
    assert.equal(reprocessingTypeOf('regOnlyExporter'), undefined)
  })
})

describe('application row', () => {
  it('applies for a reprocessor at its site with the accreditation it plans', () => {
    assert.deepEqual(applicationRow(registration()), {
      wasteProcessingType: 'Reprocessor',
      material: 'Paper or board (R3)',
      glassRecyclingProcess: undefined,
      ...siteAddress('OP-0001-S1'),
      tonnageBand: 'Up to 5,000 tonnes',
      withoutAccreditation: false
    })
  })

  it('applies for an exporter with no site and, unaccredited, no accreditation', () => {
    assert.deepEqual(
      applicationRow(
        registration({
          processingType: 'exporter',
          material: glass,
          siteId: null,
          accreditation: null
        })
      ),
      {
        wasteProcessingType: 'Exporter',
        material: 'Glass (R5)',
        glassRecyclingProcess: 'Glass other',
        tonnageBand: undefined,
        withoutAccreditation: true
      }
    )
  })
})

describe('numbers', () => {
  it('carry the year, nation, type, the org id the service gave and a serial', () => {
    assert.deepEqual(numbersFor(registration(), { orgId: 500123, serial: 2 }), {
      regNumber: 'R26ER5001230002PA',
      accNumber: 'A26ER5001230002PA'
    })
  })

  it('mark an exporter X, in its own nation', () => {
    assert.deepEqual(
      numbersFor(
        registration({
          processingType: 'exporter',
          nation: 'Northern Ireland',
          material: glass
        }),
        { orgId: 500124, serial: 1 }
      ),
      { regNumber: 'R26NX5001240001GO', accNumber: 'A26NX5001240001GO' }
    )
  })

  it('give a registered-only registration no accreditation number', () => {
    assert.deepEqual(
      numbersFor(registration({ accreditation: null }), {
        orgId: 500125,
        serial: 1
      }),
      { regNumber: 'R26ER5001250001PA', accNumber: undefined }
    )
  })

  it('take the year from when the registration went active', () => {
    assert.equal(
      numbersFor(registration({ activeFrom: '2027-03-01' }), {
        orgId: 500126,
        serial: 1
      }).regNumber,
      'R27ER5001260001PA'
    )
  })
})
