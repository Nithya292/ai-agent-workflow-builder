"use client";

import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
} from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";

const httpLink = new HttpLink({
  uri: "https://rpwtchgtqyirntusolfc.graphql.ap-south-1.nhost.run/v1",
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ApolloProvider client={client}>
      {children}
    </ApolloProvider>
  );
}