interface EDISegment {
  [key: string]: any;
}

interface EDIData {
  ISA?: EDISegment;
  GS?: EDISegment;
}

export const parseEDI = (ediString: string): EDIData => {
  const segments = ediString.split('~');
  const parsedData: EDIData = {};

  segments.forEach((segment) => {
    const elements = segment.split('*');
    const segmentType = elements[0];

    switch (segmentType) {
      case 'ISA':
        parsedData.ISA = {
          AuthorizationInformationQualifier: elements[1].trim(),
          AuthorizationInformation: elements[2].trim(),
          SecurityInformationQualifier: elements[3].trim(),
          SecurityInformation: elements[4].trim(),
          InterchangeIDQualifierSender: elements[5].trim(),
          InterchangeSenderID: elements[6].trim(),
          InterchangeIDQualifierReceiver: elements[7].trim(),
          InterchangeReceiverID: elements[8].trim(),
          InterchangeDate: elements[9].trim(),
          InterchangeTime: elements[10].trim(),
          InterchangeControlStandardsIdentifier: elements[11].trim(),
          InterchangeControlVersionNumber: elements[12].trim(),
          InterchangeControlNumber: elements[13].trim(),
          AcknowledgmentRequested: elements[14].trim(),
          TestIndicator: elements[15].trim(),
          SubelementSeparator: elements[16]?.trim(),
        };
        break;
      case 'GS':
        parsedData.GS = {
          FunctionalIdentifierCode: elements[1].trim(),
          ApplicationSenderCode: elements[2].trim(),
          ApplicationReceiverCode: elements[3].trim(),
          Date: elements[4].trim(),
          Time: elements[5].trim(),
          GroupControlNumber: elements[6].trim(),
          ResponsibleAgencyCode: elements[7].trim(),
          VersionReleaseIndustryIdentifierCode: elements[8].trim(),
        };
        break;
    }
  });
  return parsedData;
};

// @ts-ignore
export const X12Parse = (ediText: string) => {
  // Basic mapping of segment IDs to names
  const segmentNames: { [key: string]: string } = {
    ISA: 'Interchange Control Header',
    GS: 'Functional Group Header',
    ST: 'Transaction Set Header',
    BHT: 'Beginning of Hierarchical Transaction',
    SE: 'Transaction Set Trailer',
    GE: 'Functional Group Trailer',
    IEA: 'Interchange Control Trailer',
  };

  // Detailed element names for ISA segment
  const isaElementNames: string[] = [
    'Authorization Information Qualifier',
    'Authorization Information',
    'Security Information Qualifier',
    'Security Information',
    'Interchange ID Qualifier (Sender)',
    'Interchange Sender ID',
    'Interchange ID Qualifier (Receiver)',
    'Interchange Receiver ID',
    'Interchange Date',
    'Interchange Time',
    'Repetition Separator',
    'Interchange Control Version Number',
    'Interchange Control Number',
    'Acknowledgment Requested',
    'Interchange Usage Indicator',
    'Component Element Separator',
  ];

  // Detailed element names for GS segment
  const gsElementNames: string[] = [
    'Functional Identifier Code',
    "Application Sender's Code",
    "Application Receiver's Code",
    'Date',
    'Time',
    'Group Control Number',
    'Responsible Agency Code',
    'Version / Release / Industry Identifier Code',
  ];

  // Detailed element names for ST segment
  const stElementNames: string[] = [
    'Transaction Set Identifier Code',
    'Transaction Set Control Number',
    'Implementation Convention Reference',
  ];

  // Adding detailed element names for BHT segment
  const bhtElementNames: string[] = [
    'Hierarchical Structure Code',
    'Transaction Set Purpose Code',
    'Reference Identification',
    'Date',
    'Time',
    'Transactional Type Code',
  ];

  const clmElementNames: string[] = [
    'Claim ID',
    'Claim Amount',
    'Claim Filing Indicator Code',
    'Non-Institutional Claim Type Code',
    'Health Care Service Location Information',
    'Provider or Supplier Signature Indicator',
    'Assignment or Plan Participation Code',
    'Benefits Assignment Certification Indicator',
    'Release of Information Code',
    'Patient Signature Source Code',
    'Related Causes Information',
    'Special Program Code',
    'Yes/No Condition or Response Code',
    'Level of Service Code',
    'Provider Agreement Code',
    'Location ID', // Added element for Location ID
    // Add more elements as needed
  ];

  const lxElementNames: string[] = [
    'Assigned Number', // Uniquely identifies each service line in the claim
  ];

  const sv3ElementNames: string[] = [
    'Composite Medical Procedure Identifier',
    'Monetary Amount',
    'Unit or Basis for Measurement Code',
    'Quantity',
    'Facility Code Value',
    'Service Type Code',
    'Procedure Modifier',
    'Place of Service Code',
    'Composite Diagnosis Code Pointer',
    'E-Codes',
    'Composite Procedure Code Pointer',
    'Unit of Time Period or Interval',
    'Anesthesia Related Procedure Modifier',
    'Anesthesia Related Procedure Code',
    'Reference Identification',
    // Add more elements as needed
  ];

  const sbrElementNames: string[] = [
    'Payer Responsibility Sequence Number',
    'Individual Relationship Code',
    'Claim Filing Indicator Code',
    'Reference Identification',
    'Name',
    'Insurance Type Code',
    'Coordination of Benefits Code',
    'Benefits Assignment Certification Indicator',
    'Release of Information Code',
    'Reporting Category Code',
    'Claim Frequency Type Code',
    'Patient Signature Source Code',
    'Related Causes Information',
    'Special Program Code',
    // Add more elements as needed
  ];

  const nm1ElementNames: string[] = [
    'Entity Identifier Code',
    'Entity Type Qualifier',
    'Name Last or Organization Name',
    'Name First',
    'Name Middle',
    'Name Prefix',
    'Name Suffix',
    'Identification Code Qualifier',
    'Identification Code',
    'Entity Relationship Code',
    'Entity Identifier Code',
    'Name Last or Organization Name',
    'Name First',
    'Name Middle',
    'Name Prefix',
    'Name Suffix',
    'Identification Code Qualifier',
    'Identification Code',
    'Entity Relationship Code',
    // Add more elements as needed
  ];

  const tooElementNames: string[] = [
    'Tooth Number', // Placeholder for Tooth Number
    'Tooth Status', // Placeholder for Tooth Status
    'Tooth Surface', // Placeholder for Tooth Surface
    'Tooth Quadrant', // Placeholder for Tooth Quadrant
    // Add more elements as needed
  ];

  // Split the EDI text by segment terminator
  const segments = ediText.split('~');

  const jsonResult: { segments: any[] } = { segments: [] };

  let currentLXSegment: string | null = null;
  let currentCLMID: string | null = null;
  let locationID: string | null = null; // Added variable to store location ID

  // Iterate over segments
  segments.forEach((segment) => {
    const elements = segment.split('*');
    const segmentId = elements.shift();

    const segmentInfo: {
      id: string;
      name: string;
      elements: { [key: string]: string };
    } = {
      // @ts-ignore
      id: segmentId,
      // @ts-ignore
      name: segmentNames[segmentId] || 'Unknown Segment',
      elements: {},
    };

    // Map elements to their names for ISA, GS, ST, and now BHT segments
    if (segmentId === 'ISA') {
      elements.forEach((element, index) => {
        const elementName = isaElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else if (segmentId === 'GS') {
      elements.forEach((element, index) => {
        const elementName = gsElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else if (segmentId === 'ST') {
      elements.forEach((element, index) => {
        const elementName = stElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else if (segmentId === 'BHT') {
      elements.forEach((element, index) => {
        const elementName = bhtElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else if (segmentId === 'CLM') {
      elements.forEach((element, index) => {
        const elementName = clmElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
        if (index === 0) {
          currentCLMID = element;
        }
      });
      if (locationID !== null) {
        segmentInfo.elements['Location ID'] = locationID; // Include Location ID in CLM segment
      }
    } else if (segmentId === 'LX') {
      elements.forEach((element, index) => {
        const elementName = lxElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
        if (index === 0) {
          currentLXSegment = element;
        }
        //   if (currentCLMID !== null) {
        //     segmentInfo.elements['CLM ID'] = currentCLMID;
        // }
      });
    } else if (segmentId === 'SV3') {
      elements.forEach((element, index) => {
        const elementName = sv3ElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
        if (currentCLMID !== null) {
          segmentInfo.elements['CLM ID'] = currentCLMID;
        }
      });
    } else if (segmentId === 'SBR') {
      elements.forEach((element, index) => {
        const elementName = sbrElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else if (segmentId === 'NM1') {
      elements.forEach((element, index) => {
        const elementName = nm1ElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
        // Logic to associate Identification Code from NM1 segment with entity type "85" to the CLM segment
        if (element === '85') {
          // Check if entity type qualifier is "85"
          locationID = elements[8]; // Assuming the Identification Code is in the 9th element
        }
      });
    } else if (segmentId === 'TOO') {
      // Handle TOO segment
      elements.forEach((element, index) => {
        const elementName = tooElementNames[index] ?? `Element ${index + 1}`;
        segmentInfo.elements[elementName] = element;
      });
    } else {
      // Placeholder for other segments
      elements.forEach((element, index) => {
        segmentInfo.elements[`Element ${index + 1}`] = element;
      });
    }

    jsonResult.segments.push(segmentInfo);
  });

  return jsonResult;
};
