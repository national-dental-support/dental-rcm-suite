import { Request, Response, Router } from 'express';
import { X12Parse } from '../../modules/edi-parser/index';

const router = Router();

const parseEDI = (ediString: string) => {
  const segments = ediString.split('~');
  const parsedData: any = {};

  segments.forEach((segment) => {
    const [segmentId, ...dataElements] = segment.split('*');

    switch (segmentId) {
      case 'ST':
        parsedData.transactionSet = {
          transactionSetIdentifier: dataElements[0] || '',
          transactionSetControlNumber: dataElements[1] || '',
          implementationConventionReference: dataElements[2] || '',
        };
        break;
      case 'BHT':
        parsedData.bht = {
          hierarchicalStructureCode: dataElements[0] || '',
          transactionSetPurposeCode: dataElements[1] || '',
          referenceIdentification: dataElements[2] || '',
          date: dataElements[3] || '',
          time: dataElements[4] || '',
          transactionTypeCode: dataElements[5] || '',
        };
        break;
      case 'NM1':
        const [
          entityIdentifierCode,
          entityTypeQualifier,
          lastName,
          firstName,
          middleName,
          suffix,
          identificationCodeQualifier,
          identificationCode,
        ] = dataElements;
        parsedData.name = {
          entityIdentifierCode: entityIdentifierCode || '',
          entityTypeQualifier: entityTypeQualifier || '',
          lastName: lastName || '',
          firstName: firstName || '',
          middleName: middleName || '',
          suffix: suffix || '',
          identificationCodeQualifier: identificationCodeQualifier || '',
          identificationCode: identificationCode || '',
        };
        break;
      case 'PER':
        const [contactFunctionCode, name, communicationQualifier, phoneNumber] =
          dataElements;
        if (!parsedData.contactInformation) {
          parsedData.contactInformation = [];
        }
        parsedData.contactInformation.push({
          contactFunctionCode: contactFunctionCode || '',
          name: name || '',
          communicationQualifier: communicationQualifier || '',
          phoneNumber: phoneNumber || '',
        });
        break;
      // Add cases for other segments as needed
      default:
        if (!parsedData.otherSegments) {
          parsedData.otherSegments = [];
        }
        parsedData.otherSegments.push({ segmentId, dataElements });
        break;
    }
  });

  return parsedData;
};

/**
 * Post endpoint to parse and process EDI 837 strings.
 *
 * @param {Request} req - The request object from Express.js.
 * @param {Response} res - The response object from Express.js.
 */
router.post('/parse-837', (req: Request, res: Response) => {
  const ediString = req.body.data;

  if (!ediString) {
    return res.status(400).send({ message: 'EDI string is required' });
  }

  if (typeof ediString !== 'string' || ediString.length > 1_000_000) {
    return res.status(413).send({ message: 'EDI payload too large (max 1MB)' });
  }

  try {
    const parsedData = X12Parse(ediString);

    res.status(200).send({
      message: '837 EDI string parsed successfully',
      data: parsedData,
    });
  } catch (error) {
    console.error('Error parsing EDI string:', error);
    res.status(500).send({ message: 'Error parsing EDI string' });
  }
});

/**
 * Post endpoint to parse and process EDI 835 strings.
 *
 * @param {Request} req - The request object from Express.js.
 * @param {Response} res - The response object from Express.js.
 */
router.post('/parse-835', (req: Request, res: Response) => {
  const ediString = req.body.data;

  if (!ediString) {
    return res.status(400).send({ message: 'EDI string is required' });
  }

  try {
    const parsedData = parseEDI(ediString);

    res.status(200).send({
      message: '835 EDI string parsed successfully',
      data: parsedData,
    });
  } catch (error) {
    console.error('Error parsing EDI string:', error);
    res.status(500).send({ message: 'Error parsing EDI string' });
  }
});

export default router;
