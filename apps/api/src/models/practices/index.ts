export interface IPractices {
  uid: number;
  name: string;
  street_1: string;
  street_2: string | null; // Depending on whether it can be nullable in your database
  city: string;
  state: string;
  zip: string;
  primary_contact_first_name: string;
  primary_contact_last_name: string;
  primary_contact_email: string;
  primary_contact_phone_number: string;
  dso_id: number;
}
