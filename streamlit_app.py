import streamlit as st

st.text('Welcome')
st.text('Please upload your Amazon data')
st.sidebar.subheader("yan kol")
uploaded_file = st.sidebar.file_uploader(label = 'upload your file', type = ['csv', 'xlsx'])


class calculation:      
    def csv_calculation(uploaded_file):
        import pandas as pd
        import numpy as np
        sessions_limit = 10
        impression_limit = 100
        df = pd.read_csv(uploaded_file)
        df['Sessions'] = df['Sessions'].replace(',','')
        df['Sessions'] = pd.to_numeric(df['Sessions'], errors='coerce')
        return df['Sessions']

st.text('asagidaki ASIN''ler bayagi problemli, gorunuyorlar ama satilmiyorlar')
st.text(calculation.csv_calculation(uploaded_file))
