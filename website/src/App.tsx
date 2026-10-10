import { Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { About, Contact, FaqPage, Pricing, RequestDemo, Resources, Security, Support } from "@/pages/CompanyPages";
import Home from "@/pages/Home";
import { LegalIndex, LegalPage } from "@/pages/Legal";
import NotFound from "@/pages/NotFound";
import { Benefits, FeatureDetail, Features, HowItWorks, Product, WhoItsFor } from "@/pages/ProductPages";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/product" element={<Product />} />
        <Route path="/features" element={<Features />} />
        <Route path="/features/:slug" element={<FeatureDetail />} />
        <Route path="/who-its-for" element={<WhoItsFor />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/benefits" element={<Benefits />} />
        <Route path="/security" element={<Security />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/request-demo" element={<RequestDemo />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/about" element={<About />} />
        <Route path="/support" element={<Support />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/legal" element={<LegalIndex />} />
        <Route path="/legal/:slug" element={<LegalPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
