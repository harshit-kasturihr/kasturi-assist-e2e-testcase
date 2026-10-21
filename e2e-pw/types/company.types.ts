export interface Company {
  name: string;
  code?: string;
  address?: string;
  pincode?: string;
}

export interface CompanyFormData extends Company {
  contactPerson?: string;
  designation?: string;
  contactNumber?: string;
  contactEmail?: string;
}
