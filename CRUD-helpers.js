import mongoose from 'mongoose';
import NotFoundException from '../exceptions/NotFoundException.js';
import _ from 'lodash';

/**
 * @namespace CRUD
 */

/**
 * @typedef {string} CRUD.EntityId
 */

/**
 * @typedef CRUD.IdHost
 * @property {CRUD.EntityId} id
 */

/**
 * @callback CRUD.FindDocumentsByIdsWrapper
 * @param {Array<CRUD.EntityId | CRUD.IdHost>} ids
 */

/**
 * @param {module:mongoose.Model} model
 * @param {Array<CRUD.IdHost | CRUD.EntityId>} ids
 * @param {{options?: module:mongoose.QueryOptions; projection?: *}} [additionalParams]
 */
const findDocumentsByIds = (model, ids, additionalParams) =>
  model.find(
    {
      _id: {
        $in: ids.map(item =>
          item && typeof item === 'object'
            ? mongoose.Types.ObjectId(item.id)
            : mongoose.Types.ObjectId(item)
        )
      }
    },
    additionalParams?.projection || null,
    additionalParams?.options
  );

const ensureDocument = document => {
  if (_.isNil(document)) {
    throw new NotFoundException();
  }

  return document;
};

const ensureDocumentExistsByQuery = async (model, query) => {
  ensureDocument(await model.exists(query));
};

const ensureDocumentExistsById = (model, id) =>
  ensureDocumentExistsByQuery(model, { _id: mongoose.Types.ObjectId(id) });

const findDocumentByQuery = (model, query, additionalOptions) =>
  model.findOne(query, additionalOptions?.projection, additionalOptions?.options || { lean: true });

const findDocumentById = (model, id, additionalOptions) =>
  findDocumentByQuery(
    model,
    { _id: typeof id === 'string' ? mongoose.Types.ObjectId(id) : id },
    additionalOptions
  );

export default {
  findDocumentsByIds,
  ensureDocument,
  ensureDocumentExistsByQuery,
  ensureDocumentExistsById,
  findDocumentByQuery,
  findDocumentById
};
