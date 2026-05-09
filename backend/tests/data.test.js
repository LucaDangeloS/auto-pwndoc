/*
  At the end
    2 Languages: [
        {locale: 'en', language: 'English'},
        {locale: 'fr', language: 'French'}
      ]
    1 Audit type: {locale: 'en', name: 'Web'}
    1 Vulnerability type: {locale: 'en', name: 'Internal'}
    3 Sections: [
        {locale: 'en', name: 'Attack Scenario', field: 'attack_scenario'},
        {locale: 'en', name: 'Goal', field: 'goal'},
        {locale: 'fr', name: 'But', field: 'goal'}
      ]
*/

module.exports = function(request, app) {
  describe('Data Suite Tests', () => {
    var userToken = '';
    beforeAll(async () => {
      var response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'})
      userToken = response.body.datas.token
    })

    describe('Language CRUD operations', () => {
      it('Get languages', async () => {
        var response = await request(app).get('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toHaveLength(0)
      })

      it('Create 3 languages', async () => {
        var english = {
          locale: 'en',
          language: 'English'
        }

        var french = {
          locale: 'fr',
          language: 'French'
        }

        var espagnol = {
          locale: 'es',
          language: 'Espagnol'
        }
        var response = await request(app).post('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(english)
        expect(response.status).toBe(201)

        var response = await request(app).post('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(french)
        expect(response.status).toBe(201)

        var response = await request(app).post('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(espagnol)
        expect(response.status).toBe(201)
      })

      it('Should not create with existing locale', async () => {
        var language = {
          locale: 'fr',
          language: 'French2'
        }
        var response = await request(app).post('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(language)
      
        expect(response.status).toBe(422)
      })

      it('Should not create with existing name', async () => {
        var language = {
          locale: 'us',
          language: 'English'
        }
        var response = await request(app).post('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(language)
      
        expect(response.status).toBe(422)
      })

      it('Get languages', async () => {
        const expected = [
          {locale: 'en', language: 'English'},
          {locale: 'fr', language: 'French'},
          {locale: 'es', language: 'Espagnol'}
        ]

        var response = await request(app).get('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toEqual(expect.arrayContaining(expected))
      })

      it('Delete language', async () => {
        var response = await request(app).delete('/api/data/languages/es')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.status).toBe(200)

        var response = await request(app).get('/api/data/languages')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.body.datas).toHaveLength(2)
      })

      it('Should not delete language with nonexistent locale', async () => {
        var response = await request(app).delete('/api/data/languages/us')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.status).toBe(404)
      })
    })

    describe('Audit types CRUD operations', () => {
      it('Get audit types', async () => {
        var response = await request(app).get('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toHaveLength(0)
      })

      it('Create audit type Internal', async () => {
        // Get the template ID first
        response = await request(app).get('/api/templates')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        
        var templates = response.body.datas

        var auditType = {
          name: 'Internal Test',
          templates: templates
        }

        var response = await request(app).post('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(auditType)
      
        expect(response.status).toBe(201)
      })

      it('Create audit type Web', async () => {
        // Get the template ID first
        response = await request(app).get('/api/templates')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        
        var templates = response.body.datas

        var auditType = {
          name: 'Web',
          templates: templates
        }
        var response = await request(app).post('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(auditType)
      
        expect(response.status).toBe(201)
      })

      it('Should not create with existing name', async () => {
        // Get the template ID first
        response = await request(app).get('/api/templates')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        
        var templates = response.body.datas

        var auditType = {
          name: 'Web',
          templates: templates
        }
        var response = await request(app).post('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(auditType)
      
        expect(response.status).toBe(422)
      })

      it('Get audit types', async () => {
        const expected = [
          {"hidden": [], "name": "Internal Test", "sections": [], "templates": [null]},
          {"hidden": [], "name": "Web", "sections": [], "templates": [null]}
        ]
        var response = await request(app).get('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toEqual(expect.arrayContaining(expected))
      })

      it('Delete audit type', async () => {
        var response = await request(app).delete('/api/data/audit-types/Internal%20Test')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.status).toBe(200)

        var response = await request(app).get('/api/data/audit-types')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.body.datas).toHaveLength(1)
      })

      it('Should not delete audit type with nonexistent name', async () => {
        var response = await request(app).delete('/api/data/audit-types/nonexistent')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
        expect(response.status).toBe(404)
      })
    })

    describe('Vulnerability taxonomy CRUD operations', () => {
      var webRowId = '';

      it('Lists empty taxonomy', async () => {
        var response = await request(app).get('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        expect(response.body.datas).toHaveLength(0)
      })

      it('Creates a type-root row "Internal"', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Internal' })
        expect(response.status).toBe(201)
      })

      it('Creates a type-root row "Web" capturing its id', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', sortValue: 'priority', sortOrder: 'asc' })
        expect(response.status).toBe(201)
        webRowId = response.body.datas._id
      })

      it('Creates a category row "Web > Information Gathering"', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', category: 'Information Gathering' })
        expect(response.status).toBe(201)
      })

      it('Creates a subcategory row with code', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', category: 'Information Gathering', subcategory: 'Fingerprint Web Server', code: 'WSTG-INFO-02' })
        expect(response.status).toBe(201)
      })

      it('Rejects duplicate (type, category, subcategory) triple', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web' })
        expect(response.status).toBe(422)
      })

      it('Rejects POST without required type', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ category: 'orphaned' })
        expect(response.status).toBe(422)
      })

      it('Lists 4 taxonomy rows', async () => {
        var response = await request(app).get('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        expect(response.body.datas).toHaveLength(4)
        // Sort config must round-trip on the type-root row for "Web".
        var web = response.body.datas.find(r => r.type === 'Web' && !r.category && !r.subcategory)
        expect(web.sortValue).toBe('priority')
        expect(web.sortOrder).toBe('asc')
      })

      it('Updates a row by id', async () => {
        var response = await request(app).put('/api/data/vulnerability-taxonomy/' + webRowId)
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', sortValue: 'cvssScore', sortOrder: 'desc', sortAuto: false })
        expect(response.status).toBe(200)
      })

      it('Parse preview: well-formed lines', async () => {
        var text = 'WSTG\n' +
          'WSTG > Information Gathering > Fingerprint Web Server [WSTG-INFO-02]\n' +
          '# comment line, skipped\n' +
          'OSSTMM > Operations Security';
        var response = await request(app).post('/api/data/vulnerability-taxonomy/parse')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ text })
        expect(response.status).toBe(200)
        expect(response.body.datas.errors).toHaveLength(0)
        expect(response.body.datas.rows).toHaveLength(3)
        var row = response.body.datas.rows[1]
        expect(row.type).toBe('WSTG')
        expect(row.subcategory).toBe('Fingerprint Web Server')
        expect(row.code).toBe('WSTG-INFO-02')
      })

      it('Parse preview: catches duplicate lines and missing type', async () => {
        var text = 'WSTG\nWSTG\n> Orphan';
        var response = await request(app).post('/api/data/vulnerability-taxonomy/parse')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ text })
        expect(response.status).toBe(200)
        expect(response.body.datas.errors.length).toBeGreaterThan(0)
      })

      it('Bulk replace overwrites the collection', async () => {
        var response = await request(app).put('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ rows: [
            { type: 'Internal' },
            { type: 'Web' },
            { type: 'Web', category: 'Information Gathering' },
            { type: 'Web', category: 'Information Gathering', subcategory: 'Fingerprint Web Server', code: 'WSTG-INFO-02' }
          ]})
        expect(response.status).toBe(201)

        var list = await request(app).get('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(list.body.datas).toHaveLength(4)
      })

      it('Generate checklist from taxonomy returns properly shaped rows', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy/generate-checklist')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', includeCategories: true, includeSubcategories: true })
        expect(response.status).toBe(200)
        expect(Array.isArray(response.body.datas)).toBe(true)
        expect(response.body.datas.length).toBeGreaterThan(0)
        var row = response.body.datas[0]
        expect(row).toHaveProperty('label')
        expect(row).toHaveProperty('taxonomy')
        expect(row.status).toBe('untested')
        expect(row.note).toBe('')
      })

      it('Generate checklist filters out subcategories when flag is off', async () => {
        var response = await request(app).post('/api/data/vulnerability-taxonomy/generate-checklist')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ type: 'Web', includeCategories: true, includeSubcategories: false })
        expect(response.status).toBe(200)
        var subs = response.body.datas.filter(r => r.taxonomy.subcategory)
        expect(subs).toHaveLength(0)
      })

      it('Deletes a row by id', async () => {
        // Find the 'Internal' row id, delete it, verify count drops.
        var list = await request(app).get('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
        var internal = list.body.datas.find(r => r.type === 'Internal' && !r.category)
        expect(internal).toBeDefined()
        var del = await request(app).delete('/api/data/vulnerability-taxonomy/' + internal._id)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(del.status).toBe(200)
        var list2 = await request(app).get('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(list2.body.datas).toHaveLength(3)
      })

      it('Returns 404 on delete of unknown id', async () => {
        var response = await request(app).delete('/api/data/vulnerability-taxonomy/64ffffffffffffffffffffff')
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(404)
      })

      it('Restores a small canonical taxonomy for downstream tests', async () => {
        var response = await request(app).put('/api/data/vulnerability-taxonomy')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({ rows: [{ type: 'Internal' }] })
        expect(response.status).toBe(201)
      })
    })

    describe('Sections CRUD operations', () => {
      it('Get sections', async () => {
        var response = await request(app).get('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toHaveLength(0)
      })

      it('Create section Attack Scenario locale en', async () => {
        var section = {
          name: 'Attack Scenario',
          field: 'attack_scenario'
        }
        var response = await request(app).post('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(section)
      
        expect(response.status).toBe(201)
      })

      it('Create section But locale fr', async () => {
        var section = {
          name: 'But',
          field: 'goal'
        }
        var response = await request(app).post('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(section)
      
        expect(response.status).toBe(201)
      })

      it('Should not create section with existing name', async () => {
        var section = {
          name: 'Attack Scenario',
          field: 'goal'
        }
        var response = await request(app).post('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(section)
      
        expect(response.status).toBe(422)
      })

      it('Should not create section with existing field', async () => {
        var section = {
          name: 'But2',
          field: 'goal'
        }
        var response = await request(app).post('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
          .send(section)
      
        expect(response.status).toBe(422)
      })

      it('Get sections', async () => {
        const expected = [
          {name: 'Attack Scenario', field: 'attack_scenario'},
          {name: 'But', field: 'goal'},
        ]
        var response = await request(app).get('/api/data/sections')
          .set('Cookie', [
            `token=JWT ${userToken}`
          ])
      
        expect(response.status).toBe(200)
        expect(response.body.datas).toEqual(expect.arrayContaining(expected))
      })

      //it('Should not delete nonexistent section', async () => {
      //  var response = await request(app).delete('/api/data/sections/attack_scenario/ru')
      //    .set('Cookie', [
      //      `token=JWT ${userToken}`
      //    ])
      //  expect(response.status).toBe(404)
      //})

      //it('Delete section', async () => {
      //  const expected = [
      //    {locale: "en", name: 'Attack Scenario', field: 'attack_scenario'},
      //    {locale: "fr", name: 'Scenario', field: 'attack_scenario'},
      //    {locale: "en", name: 'Goal', field: 'goal'},
      //  ]

      //  var response = await request(app).delete('/api/data/sections/but/fr')
      //    .set('Cookie', [
      //      `token=JWT ${userToken}`
      //    ])
      //  expect(response.status).toBe(200)

      //  var response = await request(app).get('/api/data/sections')
      //    .set('Cookie', [
      //      `token=JWT ${userToken}`
      //    ])
      //  expect(response.body.datas).toHaveLength(3)
      //  expect(response.body.datas).toEqual(expect.arrayContaining(expected))
      //})
    })
  })
}