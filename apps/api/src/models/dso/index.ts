export interface IDSO {
  uid: number;
  name: string;
  street_1: string;
  street_2: string | null;
  city: string;
  state: string;
  zip: string;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  primary_contact_email: string;
  primary_contact_phone_number: string;
  primary_contact_street_1: string;
  primary_contact_street_2: string | null;
  primary_contact_city: string;
  primary_contact_state: string;
  primary_contact_zip: string;
  billing: string;
  entity: string;
  dso_id: number;
}
